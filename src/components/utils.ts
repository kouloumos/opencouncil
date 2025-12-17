import { PersonWithRelations } from '@/lib/db/people';
import { PartyWithPersons } from '@/lib/db/parties';
import { PeopleOrdering } from '@prisma/client';

/**
 * Sorts an array of Person objects by the last word in their name (typically last name)
 */
export const sortPersonsByLastName = (persons: PersonWithRelations[]): PersonWithRelations[] => {
    return [...persons].sort((a, b) => {
        const aLastWord = a.name.split(" ").pop() || "";
        const bLastWord = b.name.split(" ").pop() || "";
        return aLastWord.localeCompare(bLastWord);
    });
};

/**
 * Sorts people by party ranking when peopleOrdering is 'partyRank'
 * - First sorts parties by member count (descending)
 * - Then sorts people within each party by rank (ascending, nulls last)
 */
export const sortPeopleByPartyRank = (
    persons: PersonWithRelations[],
    parties: PartyWithPersons[],
    peopleOrdering: PeopleOrdering
): PersonWithRelations[] => {
    if (peopleOrdering !== 'partyRank') {
        return sortPersonsByLastName(persons);
    }

    // Group people by party
    const peopleByParty = new Map<string, PersonWithRelations[]>();
    
    // Initialize map with all parties
    parties.forEach(party => {
        peopleByParty.set(party.id, []);
    });
    
    // Add people without parties to a special group
    peopleByParty.set('_no_party', []);
    
    persons.forEach(person => {
        const partyRole = person.roles.find(role => role.partyId);
        if (partyRole?.partyId) {
            const partyPeople = peopleByParty.get(partyRole.partyId) || [];
            partyPeople.push(person);
            peopleByParty.set(partyRole.partyId, partyPeople);
        } else {
            const noPartyPeople = peopleByParty.get('_no_party') || [];
            noPartyPeople.push(person);
            peopleByParty.set('_no_party', noPartyPeople);
        }
    });
    
    // Sort parties by member count (descending)
    const sortedParties = [...parties].sort((a, b) => {
        const aCount = peopleByParty.get(a.id)?.length || 0;
        const bCount = peopleByParty.get(b.id)?.length || 0;
        return bCount - aCount;
    });
    
    // Sort people within each party by rank, then by name
    const sortedPeople: PersonWithRelations[] = [];
    
    sortedParties.forEach(party => {
        const partyPeople = peopleByParty.get(party.id) || [];
        const sortedPartyPeople = partyPeople.sort((a, b) => {
            const aRole = a.roles.find(role => role.partyId === party.id);
            const bRole = b.roles.find(role => role.partyId === party.id);
            const aRank = aRole?.rank;
            const bRank = bRole?.rank;
            
            // Sort by rank first (ascending, nulls last)
            if (aRank !== null && bRank !== null) {
                return aRank - bRank;
            }
            if (aRank !== null) return -1;
            if (bRank !== null) return 1;
            
            // Then by name
            return a.name.localeCompare(b.name);
        });
        sortedPeople.push(...sortedPartyPeople);
    });
    
    // Add people without parties at the end, sorted by name
    const noPartyPeople = peopleByParty.get('_no_party') || [];
    const sortedNoPartyPeople = sortPersonsByLastName(noPartyPeople);
    sortedPeople.push(...sortedNoPartyPeople);
    
    return sortedPeople;
};
