#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { TicketBlasterStack } from '../lib/ticket-blaster-stack';

const app = new cdk.App();
new TicketBlasterStack(app, 'TicketBlasterStack', {
    description: 'Infrastructure for the Ticket Blaster application',
    env: {account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION},
});