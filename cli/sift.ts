// Entry point for `npm run sift -- <command>`. See cli/commands.ts.
import { main } from "./commands";

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
