# Database Seeding

This document explains the database seeding process and tools in detail.

## Overview

The seeding process consists of two main components:
1. A seed data generator script (`scripts/generate-seed.ts`)
2. A seeding script (`prisma/seed.ts`) that consumes the generated data

## Generating Seed Data

The `generate-seed` script extracts a subset of data from an existing database to create seed data for development:

```bash
npm run generate-seed -- --source=postgresql://user:pass@host:port/db --pairs=city1/meeting1,city2/latest
```

### Options

- `--source`: Connection string for the source database (required)
- `--output`: Path to save the JSON file (default: ./prisma/seed_data.json)
- `--pairs`: Comma-separated list of cityId/meetingId pairs to include

Use the special value "latest" as meetingId to include the most recent meeting for a city:
```bash
npm run generate-seed -- --source=postgresql://db-url --pairs=athens/latest,chania/latest
```

### Data Structure

The seed data follows a structure that avoids duplication and maintains clear relationships between entities:

1. **Core Entities**: Topics and cities are foundational and don't depend on other entities
2. **One-to-Many Relationships**: When an entity can have many related records (e.g., a person having multiple roles), the related records are included with the parent entity
3. **Entity References**: Instead of duplicating entity data, references to existing entities are used (e.g., a speaker segment referencing a speaker tag by ID)

## Seeding Process

The seeding process is handled by `prisma/seed.ts` which:

1. Checks for a local `seed_data.json` file
2. If not found, downloads it from the project's GitHub repository
3. Creates a super admin user if `SUPER_ADMIN_EMAIL` is set
4. Seeds the database with the data in the following order:
   - Core entities (topics, cities)
   - Administrative bodies and parties
   - Persons with their roles and speaker tags
   - Meetings with all related data (including speaker segments)
   - Voiceprints (which depend on speaker segments)

### Dependencies and Order

The seeding process follows a specific order to respect entity dependencies:

1. **Core Entities** (no dependencies)
   - Topics
   - Cities

2. **City-Related Entities** (depend on cities)
   - Administrative bodies
   - Parties

3. **Person-Related Entities** (depend on cities and parties)
   - Persons
   - Roles
   - Speaker tags

4. **Meeting-Related Entities** (depend on cities, administrative bodies, and persons)
   - Meetings
   - Speaker segments
   - Utterances
   - Words
   - Subjects
   - Highlights
   - Podcast specs

5. **Voiceprints** (depend on speaker segments and persons)
   - Voiceprints are seeded last since they require speaker segments to exist

### Configuration

The seeding process can be configured through environment variables:

```bash
# URL to download seed data from if local file doesn't exist
SEED_DATA_URL=https://custom-url/seed_data.json

# Path to local seed data file
SEED_DATA_PATH=./custom/path/seed_data.json

# Email for creating a super admin user
# you must have access to this email as
# it will be used for email login
SUPER_ADMIN_EMAIL=admin@example.com
```