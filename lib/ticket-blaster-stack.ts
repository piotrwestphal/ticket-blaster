import * as cdk from 'aws-cdk-lib'
import {Duration, RemovalPolicy} from 'aws-cdk-lib'
import {Construct} from 'constructs'
import {NodejsFunction} from 'aws-cdk-lib/aws-lambda-nodejs'
import {Code, LayerVersion, Runtime} from 'aws-cdk-lib/aws-lambda'
import {join} from 'path'
import {Rule, Schedule} from 'aws-cdk-lib/aws-events'
import {NodejsFunctionProps} from 'aws-cdk-lib/aws-lambda-nodejs/lib/function'
import {LambdaFunction} from 'aws-cdk-lib/aws-events-targets'
import {AttributeType, BillingMode, Table} from 'aws-cdk-lib/aws-dynamodb'
import {TableAttr} from './consts'
import {LayerDef} from './types'
import {Topic} from 'aws-cdk-lib/aws-sns'
import {EmailSubscription} from 'aws-cdk-lib/aws-sns-subscriptions'

export class TicketBlasterStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props)

        const subscriptionEmails = this.node.tryGetContext('emails') as string[]
        // TODO: add ttl for seats entities for automatic removal
        const table = new Table(this, 'Table', {
            partitionKey: {
                name: TableAttr.PK,
                type: AttributeType.STRING
            },
            sortKey: {
                name: TableAttr.SK,
                type: AttributeType.STRING
            },
            readCapacity: 5,
            writeCapacity: 5,
            billingMode: BillingMode.PROVISIONED,
            removalPolicy: RemovalPolicy.DESTROY,
        })

        const topic = new Topic(this, 'FreeSeatsTopic')
        subscriptionEmails.forEach(email => {
            topic.addSubscription(new EmailSubscription(email))
        })
        const htmlParserLayer = {
            ver: new LayerVersion(this, 'HtmlParserLayer', {
                code: Code.fromAsset(join('layers', 'html-parser')),
                description: 'AWS client',
                compatibleRuntimes: [Runtime.NODEJS_18_X],
                removalPolicy: RemovalPolicy.DESTROY
            }),
            module: 'html-parser'
        } satisfies LayerDef

        const commonLambdaProps = {
            runtime: Runtime.NODEJS_18_X,
            bundling: {
                externalModules: [htmlParserLayer.module, '@aws-sdk']
            },
            layers: [htmlParserLayer.ver],
            environment: {
                TABLE_NAME: table.tableName,
                SNS_TOPIC_ARN: topic.topicArn
            }
        } satisfies Partial<NodejsFunctionProps>

        const searchEventsFunc = new NodejsFunction(this, 'SearchEventsFunc', {
            description: 'Search for available events',
            timeout: Duration.seconds(10),
            entry: join(__dirname, 'lambdas', 'search', 'search-events.ts'),
            ...commonLambdaProps
        })
        table.grantReadWriteData(searchEventsFunc)

        new Rule(this, 'SearchEventsLambdaRule', {
            // run every day at 12pm
            schedule: Schedule.cron({minute: '0', hour: '12'}),
            targets: [new LambdaFunction(searchEventsFunc)]
        })

        const searchSeatsFunc = new NodejsFunction(this, 'SearchSeatsFunc', {
            description: 'Search for free seats',
            timeout: Duration.seconds(10),
            entry: join(__dirname, 'lambdas', 'search', 'search-seats.ts'),
            ...commonLambdaProps
        })
        table.grantReadWriteData(searchSeatsFunc)
        topic.grantPublish(searchSeatsFunc)

        new Rule(this, 'SearchTicketsLambdaRule', {
            // run every 15 minutes
            schedule: Schedule.cron({minute: '0/15'}),
            targets: [new LambdaFunction(searchSeatsFunc)]
        })

        const dailyStatusFunc = new NodejsFunction(this, 'DailyStatusFunc', {
            description: 'Gives daily updates to users',
            timeout: Duration.seconds(10),
            entry: join(__dirname, 'lambdas', 'status', 'daily-status.ts'),
            ...commonLambdaProps
        })
        table.grantReadData(dailyStatusFunc)
        topic.grantPublish(dailyStatusFunc)

        new Rule(this, 'DailyStatusRule', {
            // run every day at 9am
            schedule: Schedule.cron({minute: '0', hour: '9'}),
            targets: [new LambdaFunction(dailyStatusFunc)]
        })
    }
}
