process.env.NEXTAUTH_URL = 'https://opentranscripts.example';
jest.mock('@/lib/genericMode', () => ({
    isGenericMode: () => true,
    appName: () => 'OpenTranscripts',
}));

// react-dom/server, not @react-email/render: the latter imports dynamically, which jest does not run.
import { renderToStaticMarkup } from 'react-dom/server';
import { AuthEmail } from '../AuthEmail';
import { UserInviteEmail } from '../user-invite';
import { WorkspaceInviteEmail } from '../workspace-invite';

/** An OpenTranscripts user receives no email that names or links to OpenCouncil. */
describe('the emails of generic mode', () => {
    it.each([
        ['the sign-in email', () => AuthEmail({ url: 'https://opentranscripts.example/api/auth/callback/resend?token=t', locale: 'el' })],
        ['the invite of a superadmin', () => UserInviteEmail({ name: 'Μαρία', inviteUrl: 'https://opentranscripts.example/sign-in?token=t' })],
        ['the workspace invite', () => WorkspaceInviteEmail({ name: 'Μαρία', workspaceName: 'Αρχείο', inviteUrl: 'https://opentranscripts.example/sign-in?token=t' })],
    ])('%s names OpenTranscripts only', (_name, email) => {
        const html = renderToStaticMarkup(email());

        expect(html).toContain('OpenTranscripts');
        expect(html).not.toMatch(/opencouncil/i);
    });

    it('shows the logo of the OpenTranscripts host', () => {
        const html = renderToStaticMarkup(AuthEmail({ url: 'https://opentranscripts.example/x', locale: 'el' }));

        expect(html).toContain('src="https://opentranscripts.example/logo.png"');
    });
});
