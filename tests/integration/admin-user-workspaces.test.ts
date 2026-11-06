/** @jest-environment node */

jest.mock('@/lib/auth', () => ({
    withUserAuthorizedToEdit: jest.fn(),
    getCurrentUser: jest.fn(),
}))

import prisma from '@/lib/db/prisma'
import { updateUser } from '@/lib/db/users'
import { resetDatabase } from '../helpers/test-db'
import { createCity, createUser } from '../helpers/factories'

/**
 * The admin user form lists cities, parties, persons and bodies. A workspace
 * that is not a city is not in it, so a save of the form must not take the
 * user out of their workspaces.
 */
describe('updateUser and workspace memberships', () => {
    beforeEach(async () => {
        await resetDatabase(prisma)
    })

    test('keeps the workspaces of a user whose rights the admin form saves', async () => {
        const user = await createUser('member@example.com')
        const city = await createCity({ id: 'c1' })
        await prisma.workspace.create({ data: { id: 'ws1', name: 'Workspace' } })
        await prisma.administers.createMany({
            data: [
                { userId: user.id, cityId: 'ws1' },
                { userId: user.id, cityId: city.id },
            ],
        })

        // The form sends the rights it shows: here, none.
        await updateUser(user.id, { name: 'Member', administers: [] })

        const rows = await prisma.administers.findMany({ where: { userId: user.id }, select: { cityId: true } })
        expect(rows).toEqual([{ cityId: 'ws1' }])
    })

    test('still replaces the rights the form shows', async () => {
        const user = await createUser('admin@example.com')
        await createCity({ id: 'c1' })
        await createCity({ id: 'c2' })
        await prisma.administers.create({ data: { userId: user.id, cityId: 'c1' } })

        await updateUser(user.id, { administers: [{ cityId: 'c2', partyId: null, personId: null, administrativeBodyId: null }] })

        const rows = await prisma.administers.findMany({ where: { userId: user.id }, select: { cityId: true } })
        expect(rows).toEqual([{ cityId: 'c2' }])
    })
})
