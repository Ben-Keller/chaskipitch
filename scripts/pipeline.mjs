import { spawn } from "child_process";

const MODES = new Set(["build", "validate", "ci"]);
const mode = process.argv[2] ?? "ci";

if (!MODES.has(mode)) {
  console.error(
    `Unknown pipeline mode '${mode}'. Expected one of: ${[...MODES].join(", ")}`
  );
  process.exit(1);
}

const STEPS = {
  build: [
    "build:geo",
    "build:signals",
    "build:videos",
    "build:photo-assignments",
    "build:creative-sequences"
  ],
  validate: ["validate:data", "validate:geo", "validate:signals", "validate:qa"],
  ci: [
    "build:geo",
    "build:signals",
    "build:videos",
    "build:photo-assignments",
    "build:creative-sequences",
    "validate:data",
    "validate:geo",
    "validate:signals",
    "validate:qa",
    "build",
    "perf:budget",
    "check:generated"
  ]
};

function runScript(scriptName) {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["run", scriptName], {
      stdio: "inherit",
      env: process.env
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`npm run ${scriptName} failed with exit code ${code ?? "unknown"}`));
    });
  });
}

async function main() {
  const steps = STEPS[mode];
  console.log(`Running pipeline mode '${mode}' with ${steps.length} steps.`);

  for (const step of steps) {
    console.log(`\n==> ${step}`);
    await runScript(step);
  }

  console.log(`\nPipeline '${mode}' completed successfully.`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
