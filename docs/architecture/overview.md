# Architecture Overview

Beauty SaaS Platform starts as a modular monolith with a Next.js frontend, NestJS API, PostgreSQL database, and provider interfaces for storage and jobs.

Phase one optimizes for low cost, direct operations, and tenant isolation. Infrastructure can later move from Supabase PostgreSQL to Neon, RDS, Cloud SQL, or another managed PostgreSQL service without rewriting business logic.
