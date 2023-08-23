import { checkIssues } from './checkIssues';

(async () => {
  try {
    await checkIssues();

  } catch (error) {
    console.log(`Error processing issues: ${error.message}`);
  }
})();