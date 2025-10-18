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
    const previewText = `Προσκληθήκατε να συμμετάσχετε στο ${workspaceName}`

    return (
        <Html>
            <Head />
            <Preview>{previewText}</Preview>
            <Body style={main}>
                <Container style={container}>
                    <Heading style={h1}>Πρόσκληση σε Χώρο Εργασίας</Heading>
                    <Text style={text}>Γεια σας {name},</Text>
                    <Text style={text}>
                        Προσκληθήκατε να συμμετάσχετε στο χώρο εργασίας <strong>{workspaceName}</strong> στο OpenTranscripts.
                        Πατήστε τον παρακάτω σύνδεσμο για να συνδεθείτε και να αρχίσετε τη συνεργασία:
                    </Text>
                    <Link
                        href={inviteUrl}
                        style={button}
                    >
                        Συμμετοχή στο {workspaceName}
                    </Link>
                    <Text style={text}>
                        Μόλις συνδεθείτε, θα έχετε πλήρη πρόσβαση για προβολή και επεξεργασία απομαγνητοφωνήσεων σε αυτόν τον χώρο εργασίας.
                    </Text>
                    <Text style={text}>
                        Αν χρειάζεστε βοήθεια, μπορείτε να απαντήσετε σε αυτό το email ή να μας καλέσετε στο {env.NEXT_PUBLIC_CONTACT_PHONE}.
                    </Text>
                    <Text style={text}>
                        Με εκτίμηση,
                        <br />
                        Η Ομάδα του OpenTranscripts
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

