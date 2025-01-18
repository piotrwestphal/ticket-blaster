import {PkValue, TableAttr} from './consts'
import {LayerVersion} from 'aws-cdk-lib/aws-lambda'

type BaseEntity = Readonly<{
    [TableAttr.PK]: PkValue
    [TableAttr.SK]: string          // event name
    createdAt: number
}>

export type EventEntity = Readonly<{
    [TableAttr.PK]: PkValue.EVENT
    link: string
    activated: boolean
    includedDates: string[]
    updatedAt: number
}> & BaseEntity

export type TicketItem = Readonly<{
    date: string
    time: string
    seats: string
    link: string
}>

export type SeatsEntity = Readonly<{
    [TableAttr.PK]: PkValue.SEATS
    items: TicketItem[]
}> & BaseEntity

export type LayerDef = Readonly<{
    ver: LayerVersion
    module: string
}>