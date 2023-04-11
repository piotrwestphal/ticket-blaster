import {SeatsEntity, TicketItem} from '../../types'

type ComparedItem = TicketItem & { id: string }

export type DetectedChanges = Readonly<{
    add: TicketItem[]
    miss: TicketItem[]
    diff: { prev: TicketItem, curr: TicketItem }[]
    sum: number
}>
export const detectChanges = (prevEntity: SeatsEntity,
                              currEntity: SeatsEntity,
                              freeSeatsThreshold: number = 0): DetectedChanges => {
    const prevItemsById = new Map(prevEntity.items.map(v => toEntry(v)))
    const currItemsById = new Map(currEntity.items.map(v => toEntry(v)))
    console.log('PREV', prevItemsById)
    console.log('CURR', currItemsById)

    const missing = prevEntity.items
        .map(v => ({...v, id: toCompareId(v)} as ComparedItem))
        .filter(v => !currItemsById.has(v.id))

    const differences = [] as DetectedChanges['diff']
    const additional = [] as TicketItem[]

    currEntity.items.map(v => ({...v, id: toCompareId(v)} as ComparedItem))
        .forEach(curr => {
            const {id, seats} = curr
            if (prevItemsById.has(id)) {
                const prev = prevItemsById.get(id) as TicketItem
                if (seats !== prev.seats) {
                    differences.push({curr, prev})
                }
            } else {
                additional.push(curr)
            }
        })
    return {
        sum: additional.length + missing.length + differences.length,
        add: additional,
        miss: missing,
        diff: differences,
    }
}

const toEntry = (item: TicketItem): [string, TicketItem] => [toCompareId(item), item]
const toCompareId = ({date, time}: TicketItem) => `${date.replace(' ', '')}#${time}`