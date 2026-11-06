import { renderHook } from '@testing-library/react';
import { canAccessMyHighlights } from '@/lib/db/highlights';
import { useAccountLinks } from '../account-links';

jest.mock('next-auth/react', () => ({
    useSession: () => ({ data: { user: { id: 'user-1' } } }),
}));
jest.mock('@/lib/db/highlights', () => ({ canAccessMyHighlights: jest.fn().mockResolvedValue(true) }));
jest.mock('@/lib/genericMode', () => ({ isGenericMode: () => true }));

/** OpenTranscripts has no highlights and no notifications; its users work in workspaces. */
describe('useAccountLinks in generic mode', () => {
    it('offers the workspaces and the profile only, without asking about highlights', () => {
        const { result } = renderHook(() => useAccountLinks());

        expect(result.current.map((link) => link.href)).toEqual(['/workspaces', '/profile']);
        expect(canAccessMyHighlights).not.toHaveBeenCalled();
    });
});
