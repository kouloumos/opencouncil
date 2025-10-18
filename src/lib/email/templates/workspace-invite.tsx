import {
    Body,
    Container,
    Head,
    Heading,
    Html,
    Link,
    Preview,
    Text,
} from "@react-email/components"
import * as React from "react"
import { env } from "@/env.mjs"

interface WorkspaceInviteEmailProps {
    name: string
    workspaceName: string
    inviteUrl: string
}

export const WorkspaceInviteEmail = ({ name, workspaceName, inviteUrl }: WorkspaceInviteEmailProps) => {
    const previewText = `You've been invited to join ${workspaceName}`

    return (
        <Html>
            <Head />
            <Preview>{previewText}</Preview>
            <Body style={main}>
                <Container style={container}>
                    <Heading style={h1}>Workspace Invitation</Heading>
                    <Text style={text}>Hi {name},</Text>
                    <Text style={text}>
                        You&apos;ve been invited to join the <strong>{workspaceName}</strong> workspace on OpenTranscripts.
                        Click the link below to sign in and start collaborating:
                    </Text>
                    <Link
                        href={inviteUrl}
                        style={button}
                    >
                        Join {workspaceName}
                    </Link>
                    <Text style={text}>
                        Once you sign in, you&apos;ll have full access to view and edit transcripts in this workspace.
                    </Text>
                    <Text style={text}>
                        If you need help, feel free to reply to this email or call us at {env.NEXT_PUBLIC_CONTACT_PHONE}.
                    </Text>
                    <Text style={text}>
                        Best regards,
                        <br />
                        The OpenTranscripts Team
                    </Text>
                </Container>
            </Body>
        </Html>
    )
}

export default WorkspaceInviteEmail

const main = {
    backgroundColor: "#ffffff",
    fontFamily:
        '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
}

const container = {
    margin: "0 auto",
    padding: "20px 0 48px",
    maxWidth: "560px",
}

const h1 = {
    color: "#333",
    fontSize: "24px",
    fontWeight: "bold",
    margin: "40px 0",
    padding: "0",
    lineHeight: "40px",
}

const text = {
    color: "#333",
    fontSize: "16px",
    margin: "24px 0",
    lineHeight: "26px",
}

const button = {
    backgroundColor: "#000",
    borderRadius: "3px",
    color: "#fff",
    fontSize: "16px",
    textDecoration: "none",
    textAlign: "center" as const,
    display: "block",
    padding: "12px",
    margin: "24px 0",
}

