import { createTestSuite } from '@workflow/world-testing';

// This is the same public conformance suite used by the official Postgres
// World. It launches real Workflow HTTP servers and exercises this package via
// WORKFLOW_TARGET_WORLD, rather than importing the upstream adapter directly.
createTestSuite('@anushdsouza/world-heroku');
