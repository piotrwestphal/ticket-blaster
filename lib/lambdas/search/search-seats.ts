import {BatchWriteItemCommand, DynamoDBClient, QueryCommand} from '@aws-sdk/client-dynamodb'
import {parse, ParserElement, ParserType} from 'html-parser'
import {marshall, unmarshall} from '@aws-sdk/util-dynamodb'
import {PkValue, TableAttr} from '../../consts'
import {EventEntity, SeatsEntity} from '../../types'
import {ScheduledEvent, SearchSeats} from './search.types'
import {dynamoMaxBatchItemsLimit, splitIntoChunks} from './utils'

const tableName = process.env.TABLE_NAME as string
const region = process.env.AWS_REGION as string

const dbClient = new DynamoDBClient({region})
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
            FilterExpression: `#f0 = :f0`
        }))

        const activatedEvents = (activatedEventsResult.Items || []).map(v => unmarshall(v) as EventEntity)
        if (!activatedEvents.length) {
            return {
                statusCode: 200
            }
        }
        const searchSeatsResults = await Promise.all(activatedEvents.map(v => parse(v.link)))
        const seatsGroups = searchSeatsResults.map($ => $('div.termin').toArray().map(el => extractData($, el)))
        const eventBySeats = activatedEvents.map(({event}, idx) => ({event, items: seatsGroups[idx]}))

        console.log(`Creating [${eventBySeats.length}] seats entities with the following keys:`, eventBySeats.map(v => v.event))
        const itemsToCreate = eventBySeats
            .map(v => toEntity(v, now))
            .map(v => marshall(v))
            .map(Item => ({PutRequest: {Item}}))
        const putRequestsInChunks = splitIntoChunks(itemsToCreate, dynamoMaxBatchItemsLimit)
        const pendingPutRequests = putRequestsInChunks.map(chunk =>
            dbClient.send(new BatchWriteItemCommand({RequestItems: {[tableName]: chunk}})))

        for await (const pendingChunk of pendingPutRequests) {
            await pendingChunk
        }
        console.log(`Successfully created [${eventBySeats.length}] seats`)
        return {
            statusCode: 200
        }
    } catch (err) {
        console.error('Error during searching seats', err)
        return {
            statusCode: 500
        }
    }
}

const extractData = ($: ParserType, el: ParserElement) => ({
    date: $(el).find('div.data').text(),
    time: $(el).find('div.godzina').text(),
    freeSeats: $(el).find('div.wolne').text(),
    buyTicketLink: $(el).find('div.text-right').find('a').attr('href') as string
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
                          buyTicketLink
                      }) => ({
        date,
        time,
        seats: freeSeats,
        link: buyTicketLink,
    })),
    createdAt: now,
    updatedAt: now
})