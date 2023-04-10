export const dynamoMaxBatchItemsLimit = 25
export const splitIntoChunks = <T>(records: T[], chunkSize: number): T[][] => {
    const result: T[][] = []
    for (let i = 0; i < records.length; i += chunkSize) {
        result.push(records.slice(i, i + chunkSize))
    }
    return result
}