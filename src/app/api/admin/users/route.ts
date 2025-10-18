import { getCurrentUser } from "@/lib/auth"
import { NextResponse } from "next/server"
import { createUser, getUsers, updateUser } from "@/lib/db/users"
import { sendUserOnboardedAdminAlert } from "@/lib/discord"
import { sendInviteEmail } from "@/lib/invitations"

export async function GET() {
    const user = await getCurrentUser()
    if (!user?.isSuperAdmin) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    try {
        const users = await getUsers()
        return NextResponse.json(users)
    } catch (error) {
        console.error("Failed to fetch users:", error)
        return new NextResponse("Failed to fetch users", { status: 500 })
    }
}

export async function POST(request: Request) {
    const user = await getCurrentUser()
    if (!user?.isSuperAdmin) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    const data = await request.json()
    const { email, name, isSuperAdmin, administers } = data

    try {
        const newUser = await createUser({ email, name, isSuperAdmin, administers })

        // Send invitation email
        await sendInviteEmail(email, name)

        // Send Discord admin alert for admin invite
        sendUserOnboardedAdminAlert({
            cityName: isSuperAdmin ? 'Super Admin' : 'Admin User',
            onboardingSource: 'admin_invite',
        });

        return NextResponse.json(newUser)
    } catch (error) {
        console.error("Failed to create user:", error)
        return new NextResponse("Failed to create user", { status: 500 })
    }
}

export async function PUT(request: Request) {
    const user = await getCurrentUser()
    if (!user?.isSuperAdmin) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    const data = await request.json()
    const { id, email, name, isSuperAdmin, administers } = data

    try {
        const updatedUser = await updateUser(id, { email, name, isSuperAdmin, administers })
        return NextResponse.json(updatedUser)
    } catch (error) {
        console.error("Failed to update user:", error)
        return new NextResponse("Failed to update user", { status: 500 })
    }
}

