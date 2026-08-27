import { StepLogger } from '../steps/StepLogger';

export const stepFixture = async ({}: any, use: (r: StepLogger) => Promise<void>) => {
  const logger = new StepLogger();
  await use(logger);
};
