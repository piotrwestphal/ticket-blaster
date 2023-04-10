import {handler} from '../lib/lambdas/search/search-seats'
import {parse} from 'html-parser'

xdescribe('Search tickets', () => {
    test('should execute', async () => {
        const $ = await parse('https://bilety.muzyczny.org/')
        await handler({} as any)
    })
})

