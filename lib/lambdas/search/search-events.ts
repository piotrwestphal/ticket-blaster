import {BatchWriteItemCommand, DynamoDBClient, QueryCommand} from '@aws-sdk/client-dynamodb'
import {marshall, unmarshall} from '@aws-sdk/util-dynamodb'
import {EventEntity} from '../../types'
import {PkValue, TableAttr} from '../../consts'
import {dynamoMaxBatchItemsLimit, splitIntoChunks} from './utils'
import {ScheduledEvent, SearchEvent} from './search.types'
import {parse} from 'html-parser'

const tableName = process.env.TABLE_NAME as string
const region = process.env.AWS_REGION as string

const dbClient = new DynamoDBClient({region})
export const handler = async (_: ScheduledEvent) => {
    const now = Date.now()
    try {
        const $ = await parse('https://bilety.muzyczny.org/')
        const currentEvents = $('div.wydarzenie')
            .find('h2')
            .toArray()
            .map((element) => {
                const title = $(element).text()
                const link = $(element).find('a').attr('href') as string
                return {
                    title,
                    link
                }
            })
        console.log(`Found [${currentEvents.length}] with the following names:`, currentEvents.map(v => v.title))

        const queryResult = await dbClient.send(new QueryCommand({
            TableName: tableName,
            KeyConditionExpression: `#pk = :pk`,
            ExpressionAttributeValues: marshall({
                ':pk': PkValue.EVENT
            }),
            ExpressionAttributeNames: {
                '#pk': TableAttr.PK
            },
        }))
        const eventsFromDb = (queryResult.Items || []).map(v => unmarshall(v) as EventEntity)
        console.log(`Currently in db there are [${eventsFromDb.length}] with the following names:`, eventsFromDb.map(v => v.event))

        const eventFromDbByKey = new Map(eventsFromDb.map(v => [v.event, v] as [string, EventEntity]))

        const currentEventsByKey = new Map(currentEvents.map(v => [v.title, v] as [string, SearchEvent]))
        const eventsToCreate = currentEvents.filter(v => !eventFromDbByKey.has(v.title))
        const eventsToDelete = eventsFromDb.filter(v => !currentEventsByKey.has(v.event))

        console.log(`There are [${eventsToCreate.length}] events to be created`)
        if (eventsToCreate.length) {
            console.log(`Creating [${eventsToCreate.length}] event entities with the following keys:`, eventsToCreate.map(v => v.title))
            const itemsToCreate = eventsToCreate
                .map(v => toEntity(v, now))
                .map(v => marshall(v))
                .map(Item => ({PutRequest: {Item}}))
            const putRequestsInChunks = splitIntoChunks(itemsToCreate, dynamoMaxBatchItemsLimit)
            const pendingPutRequests = putRequestsInChunks.map(chunk =>
                dbClient.send(new BatchWriteItemCommand({RequestItems: {[tableName]: chunk}})))

            for await (const pendingChunk of pendingPutRequests) {
                await pendingChunk
            }
            console.log(`Successfully created [${eventsToCreate.length}] events`)
        }

        console.log(`There are [${eventsToDelete.length}] events to be deleted`)
        if (eventsToDelete.length) {
            console.log(`Deleting [${eventsToDelete.length}] event entities with the following keys:`, eventsToDelete.map(v => v.event))
            const keysToDelete = eventsToDelete
                .map(v => ({[TableAttr.PK]: PkValue.EVENT, [TableAttr.SK]: v.event}))
                .map(v => marshall(v))
                .map(Key => ({DeleteRequest: {Key}}))
            const deleteRequestsInChunks = splitIntoChunks(keysToDelete, dynamoMaxBatchItemsLimit)
            const pendingDeleteRequests = deleteRequestsInChunks.map(chunk =>
                dbClient.send(new BatchWriteItemCommand({RequestItems: {[tableName]: chunk}})))

            for await (const pendingChunk of pendingDeleteRequests) {
                await pendingChunk
            }
            console.log(`Successfully deleted [${eventsToCreate.length}] events`)
        }

        return {
            statusCode: 200
        }
    } catch (err) {
        console.error('Error during searching events', err)
        return {
            statusCode: 500
        }
    }
}

const toEntity = ({
                      title,
                      link
                  }: SearchEvent,
                  now: number): EventEntity => ({
    [TableAttr.PK]: PkValue.EVENT,
    [TableAttr.SK]: title,
    link,
    activated: false,
    createdAt: now,
    updatedAt: now,
})
