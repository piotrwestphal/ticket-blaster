import {DynamoDBClient, QueryCommand} from '@aws-sdk/client-dynamodb'
import {PublishCommand, SNSClient} from '@aws-sdk/client-sns'
import {marshall, unmarshall} from '@aws-sdk/util-dynamodb'
import {EventEntity} from '../../types'
import {PkValue, TableAttr} from '../../consts'
import {ScheduledEvent} from '../search/search.types'

const tableName = process.env.TABLE_NAME as string
const topicArn = process.env.SNS_TOPIC_ARN as string
const region = process.env.AWS_REGION as string

const dbClient = new DynamoDBClient({region})
const snsClient = new SNSClient({region})

export const handler = async (_: ScheduledEvent) => {
    try {
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
        const events = (queryResult.Items || []).map(v => unmarshall(v) as EventEntity)
        console.log(`Currently in db there are [${events.length}] event entities with the following names:`, events.map(v => v.event))

        const result = await snsClient.send(new PublishCommand({
            TopicArn: topicArn,
            Message: `The following events are available:\n${events.map(v => v.event).join(',\n')}\n` +
                `The following events are activated:\n${events.filter(v => v.activated).map(v => v.event).join(', ')}\n` +
                `Best regards,\nTicket Blaster Team`,
            Subject: '[Ticket Blaster] Daily status'
        }))

        return {
            statusCode: 200
        }
    } catch (err) {
        console.error('Error during daily status', err)
        return {
            statusCode: 500
        }
    }
}