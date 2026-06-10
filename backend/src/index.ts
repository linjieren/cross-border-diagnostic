import { createApp } from "./app";

const PORT = parseInt(process.env.PORT || "3011", 10);

async function main() {
  const app = await createApp();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`backend listening on :${PORT}`);
  });
}

main().catch((err) => {
  console.error("failed to start server:", err);
  process.exit(1);
});
