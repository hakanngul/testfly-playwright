import { createBdd, cucumberReporter, defineBddConfig, defineBddProject, defineParameterType, DataTable } from 'playwright-bdd';
import { test } from './fixtures';

export const { Given, When, Then, Step, Before, After } = createBdd(test);
export { createBdd, cucumberReporter, defineBddConfig, defineBddProject, defineParameterType, DataTable };
