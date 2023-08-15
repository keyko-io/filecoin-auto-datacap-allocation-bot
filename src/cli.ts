#!/usr/bin/env node

import { Command } from 'commander';
import { msigTopup, exceptionMsigTopup } from "./msigTopup";
import { clientsTopup_v2 } from "./clientTopup_v2";
import { config } from "./config";

const program = new Command();

program
  .version('1.0.0')
  .description('SSA Bot CLI');

  program
  .command('msig-topup')
  .description('Check V3 multisig addresses DataCap')
  .action(async () => {
    try {
      await msigTopup();
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });
  
  program
    .command('exception-topup')
    .description('Check exception V3 multisig addresses')
    .action(async () => {
      try {
        await exceptionMsigTopup();
      } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
      }
    });
  
  program
    .command('clients-topup')
    .description('Check issues and clients datacap')
    .action(async () => {
      try {
        await clientsTopup_v2();
      } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
      }
    });

  program
    .command('test-env')
    .description(`Check test env ${config.appId}`)
    .action(async () => {
      console.log(`If everything is ok, you should see the following health check issue: ${config.healthCheckIssue * 2}`)
    });
  
  program
    .command('check-issue')  // Nombre del nuevo comando
    .description('Check issue details')
    .option('-n, --issueNumber <number>', 'Issue Number')
    .option('-i, --issueBody <string>', 'Issue Body')
    .option('-c, --commentBody <string>', 'Comment Body')
    .option('-a, --commentAuthor <string>', 'Comment Author')
    .action(async (cmdObj) => {
        try {
            await checkIssue(Number(cmdObj.issueNumber), cmdObj.issueBody, cmdObj.commentBody, cmdObj.commentAuthor);
        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    });

  function checkIssue(issueNumber: Number, issueBody: String, commentBody: String, commentAuthor: String) {
    console.log(`Issue Number: ${issueNumber}`);
    console.log(`Issue Body: ${issueBody}`);
    console.log(`Comment Body: ${commentBody}`);
    console.log(`Comment Author: ${commentAuthor}`);
  }

program.parse(process.argv);
