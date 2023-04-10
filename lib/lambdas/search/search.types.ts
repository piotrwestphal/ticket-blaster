export type ScheduledEvent = Readonly<{
    version: string
    id: string
    'detail-type': 'Scheduled Event'
    source: 'aws.events'
    account: string
    time: string
    region: string
    resources: [string],
    detail: {}
}>

export type SearchEvent = Readonly<{
    title: string
    link: string
}>

export type SearchSeats = Readonly<{
    event: string
    items: Readonly<{
        date: string
        time: string
        freeSeats: string
        buyTicketLink: string
    }>[]
}>