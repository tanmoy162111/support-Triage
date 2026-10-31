-- Runs once, on first start of an empty data volume.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE DATABASE support_triage_test;
\connect support_triage_test
CREATE EXTENSION IF NOT EXISTS vector;
