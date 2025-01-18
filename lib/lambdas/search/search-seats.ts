import {BatchGetItemCommand, BatchWriteItemCommand, DynamoDBClient, QueryCommand} from '@aws-sdk/client-dynamodb'
import {PublishCommand, SNSClient} from '@aws-sdk/client-sns'
import {marshall, unmarshall} from '@aws-sdk/util-dynamodb'
import {parse, ParserElement, ParserType} from 'html-parser'
import {PkValue, TableAttr} from '../../consts'
import {EventEntity, SeatsEntity} from '../../types'
import {detectChanges, DetectedChanges} from './change-detector'
import {ScheduledEvent, SearchSeats} from './search.types'
import {dynamoMaxBatchItemsLimit, splitIntoChunks} from './utils'

const tableName = process.env.TABLE_NAME as string
const topicArn = process.env.SNS_TOPIC_ARN as string
const region = process.env.AWS_REGION as string

const dbClient = new DynamoDBClient({region})
const snsClient = new SNSClient({region})

export const handler = async (_: ScheduledEvent) => {
    const now = Date.now()
    try {
        const activatedEventsResult = await dbClient.send(new QueryCommand({
            TableName: tableName,
            KeyConditionExpression: `#pk = :pk`,
            ExpressionAttributeValues: marshall({
                ':pk': PkValue.EVENT,
                ':f0': true,
            }),
            ExpressionAttributeNames: {
                '#pk': TableAttr.PK,
                '#f0': 'activated',
            },
            FilterExpression: `#f0 = :f0`,
        }))

        const activatedEvents = (activatedEventsResult.Items || []).map(v => unmarshall(v) as EventEntity)
        if (!activatedEvents.length) {
            return {
                statusCode: 200,
            }
        }
        const searchSeatsResults = await Promise.all(activatedEvents.map(v => parse(v.link)))
        const seatsGroups = searchSeatsResults.map($ => $('div.termin').toArray().map(el => extractData($, el)))
        const filteredSeatsGroups = seatsGroups.map(((seatsGroup, idx) =>
            seatsGroup.filter(seats =>
                activatedEvents[idx].includedDates && activatedEvents[idx].includedDates.length > 0
                    ? activatedEvents[idx].includedDates.includes(seats.date)
                    : true)))
        console.log('Filtered seats groups:', filteredSeatsGroups)
        const eventBySeats = activatedEvents.map(({event}, idx) => ({event, items: filteredSeatsGroups[idx]}))

        const currentSeatsEntities = eventBySeats.map(v => toEntity(v, now))

        const keysToGet = currentSeatsEntities.map(v => ({type: PkValue.SEATS, event: v.event})).map(v => marshall(v))
        const getRequestsInChunks = splitIntoChunks(keysToGet, dynamoMaxBatchItemsLimit)
        const pendingGetRequests = getRequestsInChunks.map(chunk =>
            dbClient.send(new BatchGetItemCommand({RequestItems: {[tableName]: {Keys: chunk}}})))

        const previousSeatsEntities = [] as SeatsEntity[]

        for await (const pendingChunk of pendingGetRequests) {
            const items = (pendingChunk.Responses?.[tableName] || []).map(v => unmarshall(v) as SeatsEntity)
            previousSeatsEntities.push(...items)
        }

        const previousSeatsEntitiesByEvent = new Map(previousSeatsEntities.map(v => [v.event, v]))

        const detectedChanges = new Map<string, DetectedChanges>()
        currentSeatsEntities.forEach(curr => {
            if (previousSeatsEntitiesByEvent.has(curr.event)) {
                const result = detectChanges(previousSeatsEntitiesByEvent.get(curr.event) as SeatsEntity, curr)
                if (result.sum) {
                    detectedChanges.set(curr.event, result)
                }
            }
        })

        if (detectedChanges.size) {
            console.log('[DETECTED CHANGES]')
            detectedChanges.forEach((v, k) => {
                console.log(`Changes for ${k}:`, v)
            })
            const result = await snsClient.send(new PublishCommand({
                TopicArn: topicArn,
                Message: composeMessage(detectedChanges),
                Subject: '[Ticket Blaster] Change detected',
            }))
            console.log('[RESULT]', result)
        }

        console.log(`Creating [${eventBySeats.length}] seats entities with the following keys:`, eventBySeats.map(v => v.event))
        const itemsToCreate = currentSeatsEntities.map(v => marshall(v)).map(Item => ({PutRequest: {Item}}))
        const putRequestsInChunks = splitIntoChunks(itemsToCreate, dynamoMaxBatchItemsLimit)
        const pendingPutRequests = putRequestsInChunks.map(chunk =>
            dbClient.send(new BatchWriteItemCommand({RequestItems: {[tableName]: chunk}})))

        for await (const pendingChunk of pendingPutRequests) {
            await pendingChunk
        }
        console.log(`Successfully created [${eventBySeats.length}] seats`)
        return {
            statusCode: 200,
        }
    } catch (err) {
        console.error('Error during searching seats', err)
        return {
            statusCode: 500,
        }
    }
}

const extractData = ($: ParserType, el: ParserElement) => ({
    date: $(el).find('div.data').text().replace(/ /g, ''),
    time: $(el).find('div.godzina').text(),
    freeSeats: $(el).find('div.wolne').text(),
    buyTicketLink: $(el).find('div.text-right').find('a').attr('href') as string,
})

const toEntity = ({
                      event,
                      items,
                  }: SearchSeats,
                  now: number): SeatsEntity => ({
    type: PkValue.SEATS,
    event,
    items: items.map(({
                          time,
                          freeSeats,
                          date,
                          buyTicketLink,
                      }) => ({
        date: date.replace(/ /g, ''),
        time,
        seats: freeSeats,
        link: buyTicketLink,
    })),
    createdAt: now,
})

const composeMessage = (detectedChanges: Map<string, DetectedChanges>): string => {
    const eventMessages = Array.from(detectedChanges.entries())
        .map(([key, val]) => {
                const messages = [`${key}:`]
                if (val.miss.length) {
                    val.miss.forEach(v => {
                        messages.push(`+ Missing seats for ${v.date} ${v.time}`)
                        messages.push(`Link: ${v.link}`)
                    })
                }
                if (val.add.length) {
                    val.add.forEach(v => {
                        messages.push(`+ Additional seats for ${v.date} ${v.time}`)
                        messages.push(`Link: ${v.link}`)
                    })
                }
                if (val.diff.length) {
                    messages.push(`+ Seats changes:`)
                    val.diff.forEach(v => {
                        messages.push(`> ${v.curr.date} ${v.curr.time}`)
                        messages.push(`Previous - ${v.prev.seats}`)
                        messages.push(`Current - ${v.curr.seats}`)
                        if (v.curr.link) {
                            messages.push(`Link: ${v.curr.link}`)
                        }
                    })
                }
                return messages.join('\n')
            },
        )
    return `Detected changes:\n\n` + eventMessages.join('\n\n') + `\n\nBest regards,\nTicket Blaster Team`
}