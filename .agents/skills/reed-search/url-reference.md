# Reed Jobseeker API reference

The endpoints, parameters and response fields this skill depends on. Update this
file (and `cli/src/helpers.ts`) if the API changes. Official docs:
<https://www.reed.co.uk/developers/jobseeker>.

## Authentication

HTTP Basic: the API key is the **username**, the password is empty
(`Authorization: Basic base64("<key>:")`). A missing or wrong key returns `401`.

## `GET https://www.reed.co.uk/api/1.0/search`

| Param | CLI flag | Notes |
|-------|----------|-------|
| `keywords` | `--query` | free text |
| `locationName` | `--location` | town, city, county or postcode; an ambiguous name uses the best match |
| `distanceFromLocation` | `--distance` | miles, default 10 |
| `minimumSalary` / `maximumSalary` | `--salary-min` / `--salary-max` | annual |
| `permanent` / `contract` / `temp` | `--type` | `true` |
| `fullTime` / `partTime` | `--hours` | `true` |
| `postedByDirectEmployer` / `postedByRecruitmentAgency` | `--employer` | `true` |
| `graduate` | `--graduate` | `true` |
| `resultsToTake` | `--limit` | max 100 |
| `resultsToSkip` | from `--page` | offset paging |

There is **no date parameter**; `--jobage` filters the returned page client-side.

Response: `{ "results": [ ... ], "totalResults": n }`. Fields read per result:
`jobId`, `employerName`, `jobTitle`, `locationName`, `minimumSalary`,
`maximumSalary`, `currency`, `date` (posted, `dd/mm/yyyy`), `expirationDate`
(`dd/mm/yyyy`), `jobDescription` (snippet), `applications`, `jobUrl`.

## `GET https://www.reed.co.uk/api/1.0/jobs/{jobId}`

Fields read: `jobId`, `employerName`, `jobTitle`, `locationName`, `minimumSalary`,
`maximumSalary`, `currency`, `salary` (display text), `datePosted`,
`expirationDate`, `externalUrl` (off-site apply link), `jobUrl`, `fullTime`,
`partTime`, `contractType`, `jobDescription` (full HTML), `applicationCount`.

## Verification status

Built 2026-10-01 against the published docs above. The CLI's request shape is
covered by mocked tests; the field names should be confirmed against a live
response the first time a key is available (`search -q developer -l Truro`).
