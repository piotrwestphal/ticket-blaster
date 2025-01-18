import {detectChanges} from '../../../lib/lambdas/search/change-detector'
import {SeatsEntity} from '../../../lib/types'
import {PkValue} from '../../../lib/consts'

describe('Change detector', () => {
    test('should detect changes', async () => {
        const prev = {
            type: PkValue.SEATS,
            event: "PAN DISNEY ZAPRASZA",
            createdAt: 1681207214216,
            items: [
                {
                    date: "24/05/2023",
                    link: "",
                    seats: "Liczba miejsc: 0",
                    time: "Godz.13:00"
                },
                {
                    date: "26/05/2023",
                    link: "",
                    seats: "Liczba miejsc: 0",
                    time: "Godz.11:00"
                },
                {
                    date: "28/05/2023",
                    link: "",
                    seats: "Liczba miejsc: 0",
                    time: "Godz.12:00"
                }
            ],
        } satisfies SeatsEntity
        const curr = {
            type: PkValue.SEATS,
            event: "PAN DISNEY ZAPRASZA",
            createdAt: 1681207214216,
            items: [
                {
                    date: "23/05/2023",
                    link: "",
                    seats: "Liczba miejsc: 0",
                    time: "Godz.13:00"
                },
                {
                    date: "26/05/2023",
                    link: "",
                    seats: "Liczba miejsc: 0",
                    time: "Godz.11:00"
                },
                {
                    date: "28/05/2023",
                    link: "https://address.com",
                    seats: "Liczba miejsc: 1",
                    time: "Godz.12:00"
                }
            ],
        } satisfies SeatsEntity

        const result = detectChanges(prev, curr)

        expect(result.sum).toBe(3)
        expect(result.miss.length).toBe(1)
        expect(result.add.length).toBe(1)
        expect(result.diff.length).toBe(1)
    })
})
