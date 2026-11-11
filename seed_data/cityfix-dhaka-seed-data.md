# CityFix --- Dhaka Seed Data Specification

**Purpose:** A realistic starter dataset for developing and
demonstrating CityFix, a civic issue reporting and municipal response
platform.

> **Data integrity notice:** The locations and issue types are based on
> real Dhaka geography and commonly documented urban-service problems.
> Individual incidents, citizens, staff, assignments, comments,
> timestamps and statuses in this dataset are fictional demo records.
> They must not be presented as verified live complaints or actual
> municipal work.

## 1. Dataset goals

The seed data should make CityFix feel like a functioning city
operations platform:

-   Citizens submit reports with descriptions, categories, locations and
    optional photos.
-   Dispatchers review reports, reject invalid or duplicate submissions,
    verify valid reports, set priority and assign departments.
-   Crew teams receive assignments, update progress and record
    completion.
-   Administrators monitor workload, overdue cases, service-level
    performance and geographic hotspots.

Use a consistent set of relationships between users, departments, crews,
reports, assignments, comments, notifications and status history.

## 2. Dhaka locations

Use these real places as seed locations. The incident examples later in
this document are fictional scenarios situated at these places.

  Location                Area / locality                    Suggested city corporation
  ----------------------- ---------------------------------- ----------------------------
  Dhanmondi 27            Dhanmondi                          DSCC
  Green Road              Green Road / Panthapath vicinity   DSCC
  New Market              New Market                         DSCC
  Kazipara                Mirpur                             DNCC
  Shewrapara              Mirpur                             DNCC
  Mirpur 10               Mirpur                             DNCC
  Badda                   Badda                              DNCC
  Mohammadpur Town Hall   Mohammadpur                        DNCC
  Rampura                 Rampura                            DSCC
  Fakirapool              Motijheel vicinity                 DSCC

**Location data guidance**

-   Store the full address, locality, city and city-corporation
    identifier separately.
-   Do not make up latitude/longitude coordinates. Resolve coordinates
    using a geocoding service and review the results.
-   Treat city-corporation assignments above as initial demo values;
    validate administrative boundaries before using them for real
    routing or reporting.
-   For production, consider storing a point geometry (PostGIS) or
    latitude/longitude pair, plus the geocoding provider and confidence
    level.

## 3. Issue categories

  -----------------------------------------------------------------------
  Category                Example subcategories   Typical priority
  ----------------------- ----------------------- -----------------------
  Drainage & sewerage     Waterlogging, blocked   High / Critical
                          drain, damaged drain    
                          cover, sewage overflow  

  Roads & infrastructure  Pothole, damaged road,  Medium / High
                          broken footpath,        
                          damaged road barrier    

  Waste management        Garbage accumulation,   Medium / High
                          overflowing bin, missed 
                          collection              

  Electrical maintenance  Streetlight outage,     Medium / High
                          exposed electrical      
                          wiring                  

  Water supply            Water leakage, damaged  High
                          municipal pipe, low     
                          water pressure          

  Public safety           Open manhole, uncovered Critical / High
                          drain, fallen tree,     
                          dangerous obstruction   

  Traffic infrastructure  Damaged road sign,      Medium / High
                          broken signal, damaged  
                          pedestrian crossing     

  Public sanitation       Public toilet           Medium / High
                          maintenance, sewage     
                          leakage, unsanitary     
                          public area             
  -----------------------------------------------------------------------

Priority should be based on risk, not simply on the category. For
example, an open manhole on a busy road should be critical, while a
minor footpath crack may be low priority.

## 4. Sample citizen reports

All reports below are fictional demo scenarios. They are not claims that
these incidents occurred or are currently present at the named
locations.

  -------------------------------------------------------------------------------
  Report ID   Location      Report title     Category     Priority    Initial
                                                                      status
  ----------- ------------- ---------------- ------------ ----------- -----------
  CF-1001     Dhanmondi 27  Severe           Drainage     Critical    In Progress
                            waterlogging                              
                            after rainfall                            

  CF-1002     Green Road    Large pothole    Roads        High        Verified
                            near road                                 
                            junction                                  

  CF-1003     New Market    Blocked roadside Drainage     High        Assigned
                            drainage                                  

  CF-1004     Kazipara      Broken road      Roads        Medium      Reported
                            surface                                   

  CF-1005     Shewrapara    Overflowing      Waste        High        In Progress
                            roadside garbage                          

  CF-1006     Mirpur 10     Non-functional   Electrical   Medium      Assigned
                            streetlights                              

  CF-1007     Badda         Open roadside    Public       Critical    Verified
                            drain            Safety                   

  CF-1008     Mohammadpur   Garbage          Waste        High        Resolved
              Town Hall     accumulation                              

  CF-1009     Rampura       Waterlogging     Drainage     High        Reported
                            near                                      
                            intersection                              

  CF-1010     Fakirapool    Damaged footpath Roads        Medium      In Progress

  CF-1011     Dhanmondi 27  Exposed manhole  Public       Critical    Reported
                            cover            Safety                   

  CF-1012     Kazipara      Water leakage    Water Supply High        Resolved
                            from municipal                            
                            pipe                                      
  -------------------------------------------------------------------------------

Suggested distribution for the initial 12 reports:

  Status           Count
  ------------- --------
  Reported             3
  Verified             2
  Assigned             2
  In Progress          3
  Resolved             2
  **Total**       **12**

The distribution is intended to give each role something meaningful to
do in a demo. Add rejected and duplicate reports as additional records
when testing dispatcher workflows.

## 5. Departments

  -----------------------------------------------------------------------
  Department ID           Department name         Responsibilities
  ----------------------- ----------------------- -----------------------
  DEP-01                  Drainage & Sewerage     Drains, waterlogging
                                                  and sewerage issues

  DEP-02                  Roads & Infrastructure  Roads, potholes,
                                                  footpaths and barriers

  DEP-03                  Waste Management        Garbage collection and
                                                  overflowing bins

  DEP-04                  Electrical Maintenance  Streetlights and public
                                                  electrical
                                                  infrastructure

  DEP-05                  Water Supply            Water leakage and
                                                  municipal water pipes
  -----------------------------------------------------------------------

## 6. Crew teams

  -----------------------------------------------------------------------
  Crew ID           Team name         Department ID     Example skills
  ----------------- ----------------- ----------------- -----------------
  CREW-01           Drainage Response DEP-01            Drain inspection,
                    Alpha                               blockage removal,
                                                        waterlogging
                                                        response

  CREW-02           Road Maintenance  DEP-02            Pothole repair,
                    Bravo                               road patching,
                                                        footpath repair

  CREW-03           Sanitation Team   DEP-03            Waste collection,
                    Charlie                             bin clearing,
                                                        site cleanup

  CREW-04           Electrical Team   DEP-04            Streetlight
                    Delta                               inspection,
                                                        electrical
                                                        maintenance
  -----------------------------------------------------------------------

Add a water-supply crew for DEP-05 if you want every department to have
a dedicated team from the beginning. Alternatively, keep that team
unavailable to demonstrate cross-team coordination or an unassigned
queue.

## 7. Demo citizen accounts

Use clearly fictional demo identities. Do not use real citizens'
personal information.

  Citizen ID   Display name    Area
  ------------ --------------- -------------
  CIT-01       Rahim Uddin     Dhanmondi
  CIT-02       Nusrat Jahan    Green Road
  CIT-03       Tanvir Ahmed    Mirpur
  CIT-04       Sadia Islam     Badda
  CIT-05       Mahmud Hasan    Mohammadpur
  CIT-06       Farzana Akter   Rampura

Suggested additional accounts:

  User ID       Display name            Role
  ------------- ----------------------- ------------
  DISP-01       Dispatcher One          Dispatcher
  DISP-02       Dispatcher Two          Dispatcher
  ADMIN-01      CityFix Administrator   Admin
  CREWUSER-01   Crew Lead Alpha         Crew
  CREWUSER-02   Crew Lead Bravo         Crew
  CREWUSER-03   Crew Lead Charlie       Crew
  CREWUSER-04   Crew Lead Delta         Crew

For authentication, use your application's normal password-hashing flow.
Never seed plaintext production passwords. In local development,
document the demo credentials separately and require a password reset or
environment-specific safeguards.

## 8. Example report record

The following JSON is a representative report shape. Adapt property
names and enum values to the actual CityFix schema.

``` json
{
  "id": "CF-1001",
  "title": "Severe waterlogging on Dhanmondi 27",
  "description": "Rainwater has accumulated on the road, making it difficult for pedestrians and vehicles to pass. Nearby roadside drainage appears blocked.",
  "category": "DRAINAGE",
  "subcategory": "WATERLOGGING",
  "priority": "CRITICAL",
  "status": "IN_PROGRESS",
  "location": {
    "address": "Dhanmondi 27, Dhaka, Bangladesh",
    "area": "Dhanmondi",
    "city": "Dhaka",
    "cityCorporation": "DSCC",
    "latitude": null,
    "longitude": null
  },
  "reporterId": "CIT-01",
  "departmentId": "DEP-01",
  "assignedCrewId": "CREW-01",
  "source": "CITIZEN",
  "isVerified": true,
  "verifiedBy": "DISP-01",
  "verifiedAt": "2026-11-09T10:30:00+06:00",
  "createdAt": "2026-11-09T09:15:00+06:00",
  "updatedAt": "2026-11-10T14:20:00+06:00",
  "slaHours": 4,
  "dueAt": "2026-11-09T14:30:00+06:00",
  "attachments": [],
  "comments": [
    {
      "authorId": "DISP-01",
      "message": "Demo note: report verified and drainage response team assigned.",
      "createdAt": "2026-11-09T10:30:00+06:00"
    },
    {
      "authorId": "CREWUSER-01",
      "message": "Demo note: team arrived; initial inspection indicates a blocked drain.",
      "createdAt": "2026-11-10T14:20:00+06:00"
    }
  ]
}
```

The timestamps above are illustrative. The example deliberately shows an
overdue due date so the dashboard can demonstrate SLA breaches. Do not
calculate actual performance metrics from fictional timestamps.

## 9. Related data to seed

A convincing demo needs more than report rows. Seed the supporting
records below and connect them through real foreign keys.

### Assignments

Include: - Report ID - Assigned department ID - Assigned crew ID -
Dispatcher ID - Assignment timestamp - Assignment notes - Assignment
status - Accepted and started timestamps, where applicable - Completion
timestamp, where applicable

Keep assignment history as separate records. Reassigning a report should
not overwrite the previous assignment.

### Status history

Create a chronological event for every transition, for example:

1.  `REPORTED` --- citizen submitted the issue.
2.  `VERIFIED` --- dispatcher confirmed that the report is actionable.
3.  `ASSIGNED` --- department and crew selected.
4.  `IN_PROGRESS` --- crew started work.
5.  `RESOLVED` --- crew submitted completion details.
6.  `CLOSED` --- report accepted or automatically closed according to
    business rules.

Also seed `REJECTED`, `DUPLICATE` and `REOPENED` scenarios. Store the
actor, timestamp, previous status, new status and reason.

### Comments

Create 15--20 comments across reports. Include citizen follow-ups,
dispatcher verification notes, crew arrival updates, blockers and
completion notes. Comments should have an author, report ID, timestamp
and visibility setting if internal notes are supported.

### Notifications

Create 10--15 notifications for different roles: - Citizen: report
received, verified, assigned, resolved or rejected. - Dispatcher: new
report, critical report, SLA approaching or overdue. - Crew: new
assignment, reassignment or priority escalation. - Admin: critical
incident or department workload alert.

Include `readAt` or an equivalent field so unread notification counts
work.

### Attachments

Use local placeholder assets or clearly marked demo images. Include
metadata such as file name, MIME type, size, storage key, uploader and
upload timestamp. Do not reference imaginary external image URLs.

### Crew availability

Seed a mixture of available, busy, off-duty and unavailable crews.
Include team capacity and active assignment counts if those concepts
exist in the application.

## 10. Dashboard and operational scenarios

Make sure the data supports these dashboard views:

-   Total reports, open reports and resolved reports.
-   Reports grouped by status, category, priority and area.
-   Critical and overdue reports.
-   Average time to verify, assign and resolve.
-   Department workload and resolution rate.
-   Crew availability and active assignments.
-   Reports created over time.
-   Geographic clusters or hotspots.
-   Duplicate reports and reopened cases.

Do not hardcode dashboard totals separately from the underlying records.
Derive metrics from seeded reports, assignments and status history so
the numbers remain consistent when users interact with the demo.

## 11. Edge cases worth including

Add these records beyond the initial 12 reports to exercise important
workflows:

1.  **Duplicate reports:** Two citizens report the same blocked drain.
    Dispatcher links or marks one as a duplicate without losing either
    citizen's submission.
2.  **Rejected report:** A report is outside the service area or lacks
    enough information. Include a clear rejection reason.
3.  **Critical safety issue:** An uncovered manhole is escalated and
    receives immediate attention.
4.  **Unassigned report:** A verified issue waits in the dispatch queue
    because no suitable crew is available.
5.  **Reassignment:** A crew becomes unavailable and the dispatcher
    transfers the job to another team.
6.  **SLA breach:** A report passes its deadline and appears in the
    overdue queue.
7.  **Reopened issue:** A citizen disputes a resolution and the
    dispatcher reopens the report.
8.  **Crew completion evidence:** A crew submits a completion note and
    after-photo, then the report awaits review.
9.  **Concurrent updates:** Two dispatchers attempt to assign the same
    report. The backend should prevent conflicting active assignments.
10. **Missing or inaccurate location:** A report has an incomplete
    address or low-confidence geocoding result and needs manual
    correction.

## 12. Recommended data model boundaries

Keep these as separate entities or tables, connected through foreign
keys:

-   `Users`
-   `Roles` or role assignments
-   `Departments`
-   `Crews`
-   `CrewMembers`
-   `Reports`
-   `ReportLocations` (if location is independently managed)
-   `Assignments`
-   `ReportStatusHistory`
-   `Comments`
-   `Attachments`
-   `Notifications`
-   `Categories`
-   `ServiceLevelPolicies` or SLA configuration

Important implementation rules:

-   Use stable IDs and enforce foreign-key constraints.
-   Use database transactions when verifying and assigning a report.
-   Enforce one active assignment per report unless the business rules
    explicitly support multiple teams.
-   Keep status history append-only; do not rewrite past events.
-   Store timestamps in UTC in the database and convert to `Asia/Dhaka`
    in the UI. If the application stores offset-aware timestamps,
    preserve the offset consistently.
-   Keep demo data generation deterministic where possible, using a
    fixed seed so screenshots and automated tests are reproducible.
-   Make the seed operation idempotent: rerunning it should not create
    duplicate users, reports or departments.
-   Separate development/demo seed data from production migrations and
    production data.
-   Do not use real personal data or imply fictional reports are actual
    complaints.

## 13. Reference material

Use public reporting to keep the issue categories and location choices
grounded in Dhaka's urban context. These sources are background
references, not verification of the fictional sample incidents.

-   The Daily Star --- reporting on Dhaka locations at risk of
    waterlogging: https://www.thedailystar.net/
-   Bangladesh Sangbad Sangstha (BSS) --- Dhaka waterlogging and urban
    issues: https://www.bssnews.net/
-   Dhaka Tribune --- reporting on drainage and waterlogging:
    https://www.dhakatribune.com/
-   Dhaka stormwater and drainage planning material: consult the
    relevant Dhaka WASA / city corporation publications for
    authoritative technical details.

Before using any location as a real operational service area, verify its
city-corporation jurisdiction and coordinates from authoritative
municipal or mapping data.

------------------------------------------------------------------------

## Suggested next step

Implement this as a deterministic seed script that creates entities in
dependency order:

1.  Departments and categories
2.  Users and roles
3.  Crews and crew members
4.  Reports and locations
5.  Assignments
6.  Status history and comments
7.  Attachments and notifications

The seed script should log a summary of created or updated records and
fail clearly if a required relationship is missing.
