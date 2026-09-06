import type { AdministrativeBodyType } from '@prisma/client';
import { ADMIN_BODY_TYPE_ORDER } from '@/lib/utils/administrativeBodies';
import { filterActiveRoles, isActivePartyRole, isMayorRole } from '@/lib/utils/roles';

/**
 * How people are ordered, everywhere they are listed.
 *
 * One field decides the order: `Role.electedOrder`, the elected order of a seat
 * on an administrative body. The rules read it the same way on every surface:
 *
 * - In one body: the mayor, then the chair, then elected order, then surname.
 * - In one party: the mayor, then the party head, then the members by the body
 *   they sit on (council, committee, community, none), then elected order in
 *   that body, then surname.
 * - Across a city: the mayor, then each body in turn with its own order, then
 *   everyone else by surname. A person appears once, with the first body they
 *   sit on. With a body type selected, only the bodies of that type place
 *   people, so a page filtered to the committees lists them in committee order.
 *
 * The minutes read `electedOrder` through {@link getElectedOrderForBody} and
 * {@link compareRanks} and nothing else, so the order a page shows and the
 * order the minutes print come from the same numbers.
 */

/** The role fields the ordering reads. Every role shape in the app carries them. */
export interface OrderedRole {
    isHead: boolean;
    cityId: string | null;
    partyId: string | null;
    administrativeBodyId: string | null;
    electedOrder?: number | null;
    startDate: Date | null;
    endDate: Date | null;
    administrativeBody?: { id: string; name: string; type: AdministrativeBodyType } | null;
}

export interface OrderedPerson {
    id: string;
    name: string;
    roles: OrderedRole[];
}

/**
 * Get the elected order for a person within a specific administrative body.
 * Returns null if the person has no role with elected order in that body.
 */
export function getElectedOrderForBody(
    person: OrderedPerson | undefined,
    administrativeBodyId: string | null,
): number | null {
    if (!person || !administrativeBodyId) return null;
    const role = person.roles.find(
        r => r.administrativeBodyId === administrativeBodyId && r.electedOrder != null
    );
    return role?.electedOrder ?? null;
}

/**
 * Compares two order values (ascending, nulls last)
 */
export const compareRanks = (aRank: number | null, bRank: number | null): number => {
    if (aRank !== null && bRank !== null) return aRank - bRank;
    if (aRank !== null) return -1;
    if (bRank !== null) return 1;
    return 0;
};

/** True sorts before false. */
const compareFlags = (a: boolean, b: boolean): number => (a === b ? 0 : a ? -1 : 1);

const lastName = (name: string): string => name.trim().split(/\s+/).pop() ?? '';

const compareByLastName = (a: OrderedPerson, b: OrderedPerson): number =>
    lastName(a.name).localeCompare(lastName(b.name)) || a.name.localeCompare(b.name);

/**
 * Sorts an array of Person objects by the last word in their name (typically last name)
 */
export const sortPersonsByLastName = <T extends OrderedPerson>(persons: T[]): T[] => {
    return [...persons].sort(compareByLastName);
};

const activeRoles = (person: OrderedPerson): OrderedRole[] => filterActiveRoles(person.roles);

const isMayor = (person: OrderedPerson): boolean => activeRoles(person).some(isMayorRole);

const bodyRole = (person: OrderedPerson, administrativeBodyId: string): OrderedRole | null =>
    activeRoles(person).find(role => role.administrativeBodyId === administrativeBodyId) ?? null;

const NO_BODY = ADMIN_BODY_TYPE_ORDER.length;

const bodyTypeRank = (type: AdministrativeBodyType | null | undefined): number => {
    const index = type ? ADMIN_BODY_TYPE_ORDER.indexOf(type) : -1;
    return index === -1 ? NO_BODY : index;
};

/** The seat that places a person: the first body type they sit on, and their elected order there. */
function seat(person: OrderedPerson): { typeRank: number; electedOrder: number | null } {
    let typeRank = NO_BODY;
    let electedOrder: number | null = null;
    for (const role of activeRoles(person)) {
        if (!role.administrativeBodyId) continue;
        const rank = bodyTypeRank(role.administrativeBody?.type);
        const order = role.electedOrder ?? null;
        if (rank < typeRank) {
            typeRank = rank;
            electedOrder = order;
        } else if (rank === typeRank && compareRanks(order, electedOrder) < 0) {
            electedOrder = order;
        }
    }
    return { typeRank, electedOrder };
}

/** Sorts by precomputed keys, so the comparator never re-reads the roles. */
function sortWithKeys<T, K>(items: T[], key: (item: T) => K, compare: (a: K, b: K) => number): T[] {
    return items
        .map(item => ({ item, key: key(item) }))
        .sort((a, b) => compare(a.key, b.key))
        .map(({ item }) => item);
}

/**
 * The members of one administrative body: the mayor, then the chair, then
 * elected order, then surname. Someone in the list without a seat on the body
 * (a deputy mayor listed with the council) sorts after the members.
 */
export function sortBodyMembers<T extends OrderedPerson>(people: T[], administrativeBodyId: string): T[] {
    return sortWithKeys(
        people,
        person => {
            const role = bodyRole(person, administrativeBodyId);
            return {
                person,
                mayor: isMayor(person),
                member: role !== null,
                chair: role?.isHead ?? false,
                electedOrder: role?.electedOrder ?? null,
            };
        },
        (a, b) =>
            compareFlags(a.mayor, b.mayor)
            || compareFlags(a.member, b.member)
            || compareFlags(a.chair, b.chair)
            || compareRanks(a.electedOrder, b.electedOrder)
            || compareByLastName(a.person, b.person),
    );
}

/**
 * The members of one party: the mayor, then the party head, then by the body
 * they sit on (council first), then elected order in that body, then surname.
 */
export function sortPartyMembers<T extends OrderedPerson>(people: T[], partyId: string): T[] {
    return sortWithKeys(
        people,
        person => ({
            person,
            mayor: isMayor(person),
            head: person.roles.some(role => isActivePartyRole(role, partyId) && role.isHead),
            ...seat(person),
        }),
        (a, b) =>
            compareFlags(a.mayor, b.mayor)
            || compareFlags(a.head, b.head)
            || a.typeRank - b.typeRank
            || compareRanks(a.electedOrder, b.electedOrder)
            || compareByLastName(a.person, b.person),
    );
}

/**
 * Everyone in a city: the mayor, then each administrative body in turn
 * (council, then committees, then communities, each in its own order), then
 * everyone else by surname. A person appears once, with the first body they
 * sit on. The bodies come from the people's current roles.
 *
 * With `bodyType`, only the bodies of that type place people. A list filtered
 * to one type then follows that type's order even when the same people also
 * sit on the council.
 */
export function sortPeople<T extends OrderedPerson>(people: T[], bodyType?: AdministrativeBodyType): T[] {
    const bodies = new Map<string, { id: string; name: string; type: AdministrativeBodyType }>();
    for (const person of people) {
        for (const role of activeRoles(person)) {
            const body = role.administrativeBody;
            if (body && (!bodyType || body.type === bodyType) && !bodies.has(body.id)) {
                bodies.set(body.id, body);
            }
        }
    }
    const orderedBodies = [...bodies.values()].sort((a, b) =>
        bodyTypeRank(a.type) - bodyTypeRank(b.type) || a.name.localeCompare(b.name, 'el')
    );

    const placed = new Set<string>();
    const result: T[] = [];
    const place = (group: T[]) => {
        for (const person of group) {
            placed.add(person.id);
            result.push(person);
        }
    };

    place(sortPersonsByLastName(people.filter(isMayor)));
    for (const body of orderedBodies) {
        const members = people.filter(person => !placed.has(person.id) && bodyRole(person, body.id));
        place(sortBodyMembers(members, body.id));
    }
    place(sortPersonsByLastName(people.filter(person => !placed.has(person.id))));

    return result;
}

/**
 * Sorts inactive party members by most recent end date, then by name
 */
export const sortInactivePartyMembers = <T extends OrderedPerson>(
    people: T[],
    partyId: string
): T[] => {
    return [...people].sort((a, b) => {
        // Sort by most recent end date first
        const aEnd = Math.max(...a.roles
            .filter(role => role.partyId === partyId && role.endDate)
            .map(role => role.endDate ? new Date(role.endDate).getTime() : 0));
        const bEnd = Math.max(...b.roles
            .filter(role => role.partyId === partyId && role.endDate)
            .map(role => role.endDate ? new Date(role.endDate).getTime() : 0));

        if (aEnd !== bEnd) return bEnd - aEnd;

        // Then sort by name
        return a.name.localeCompare(b.name);
    });
};
