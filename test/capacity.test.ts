import { describe, expect, it } from 'vitest';

import {
  assertHerokuCapacity,
  calculateHerokuCapacity,
} from '../src/capacity.js';

describe('Heroku Postgres capacity planning', () => {
  it('accounts for pools, lazy listeners, one-offs, and headroom', () => {
    expect(
      calculateHerokuCapacity({
        applicationPoolSize: 2,
        databaseConnectionLimit: 20,
        processes: 1,
        workflowPoolSize: 5,
      }),
    ).toMatchObject({
      availableConnections: 9,
      requiredConnections: 11,
      safe: true,
    });
  });

  it('detects a formation that exceeds its database plan', () => {
    const input = {
      databaseConnectionLimit: 20,
      processes: 2,
      workflowPoolSize: 10,
    };

    expect(calculateHerokuCapacity(input)).toMatchObject({
      availableConnections: -5,
      requiredConnections: 25,
      safe: false,
    });
    expect(() => assertHerokuCapacity(input)).toThrow(
      'exceeding the configured limit of 20',
    );
  });

  it('rejects invalid capacity inputs', () => {
    expect(() =>
      calculateHerokuCapacity({
        databaseConnectionLimit: 20,
        processes: 0,
        workflowPoolSize: 5,
      }),
    ).toThrow('processes must be a positive integer');
  });
});
