# Owner feedback register - decoshop-livreur

> Raw feedback from owner Mommy Jayce.
> Each entry must translate into at least one concrete rule,
> code change, lesson, or blacklisted/discarded entry.
>
> Append-only. Never delete; supersede with a new dated entry.

## 2026-05-03  Establish this project store and cross-project bedrock
  - verbatim       : "set the basis such that a new chat will
                     pre-read all the information in the db_store
                     folder, then in the project_store (that you
                     will build)"
  - translated to  :
    - db.md M01 PROTOCOL: mandatory session-start READ ORDER
      (db_store\db.md -> blacklisted.md -> discarded.md ->
      .project-store\knowledge.md -> dossier.md -> roadmap.md ->
      decisions.md -> log.md -> blacklisted.md -> discarded.md ->
      boss-feedback.md -> owner-feedback.md).
    - created this .project-store\ with all 9 M08 files, seeded
      from README + code context.
  - status         : addressed

## 2026-05-03  Cascade works extensively and autonomously post-roadmap
  - verbatim       : "once you have the context, work patterns,
                     flows and functionalities that are necessary -
                     meaning after creation of the initial roadmap,
                     and full understanding of direction wanted"
  - translated to  :
    - db.md M05 step 5 POST-ROADMAP EXTENSIVE AUTONOMY codified.
    - M10 Q-004 archived as ANSWERED.
    - on this project: roadmap.md is the validated plan. Cascade
      executes Phase N until the Phase's DoD is met, then
      check-ins with a 1-3 line status, then proceeds to Phase
      N+1 unless owner diverts.
  - status         : addressed

## 2026-05-03  Use any library that makes work faster; do the research
  - verbatim       : "let them feel free to use any library that
                     makes work faster and easier and they have
                     to do research to get these, not just from
                     their knowledge bas but from wider and
                     multiple sources and compare efficiency"
  - translated to  :
    - db.md W04.14 LIBRARY-SELECTION codified: free-to-pick +
      duty to research multi-source + 8-axis compare + adoption
      gates + rejection recording.
    - on this project: new deps get an ADR (ADR-NNN) in
      decisions.md with the research summary + axes scores.
  - status         : addressed

## 2026-05-03  Resources classified by business type
  - verbatim       : "resources should be classified by type as
                     well, is it fast food, a restaurant, or any
                     other ones (for all the project in and to
                     be in the microdidact folder)"
  - translated to  :
    - db.md W04.13 BUSINESS-TYPES codified with 8 sub-recipes:
      restaurant, fast food, retail, automotive, market,
      delivery/logistics (this project), professional services,
      events.
    - this project's recipe is W04.13.F DELIVERY / LOGISTICS.
      Referenced from knowledge.md and dossier.md.
  - status         : addressed

## 2026-05-03  Mentions legales / gov API how-to must be concrete
  - verbatim       : "there should be information on how you got
                     what i gave an example earlier: if i want to
                     get the mention legales, or use a particular
                     gouvernment API or use something, what and
                     how do i do it?"
  - translated to  :
    - db.md W04.2 expanded with concrete HOW-TO and endpoints
      for: T-annuaire-entreprises-api (public, no-auth),
      T-insee-sirene-api (OAuth2, free tier), T-data-gouv-fr
      (catalog), T-geo-api-gouv-fr (communes), T-adresse-api-
      gouv-fr (BAN autocomplete), T-mentions-legales-generator
      (options + recommended manual+API path), T-api-gouv-catalog
      (meta-index of 150+ French public APIs).
  - status         : addressed
