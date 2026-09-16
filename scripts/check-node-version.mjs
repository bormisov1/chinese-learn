const requiredVersion = "v22.13.0";

if (process.version !== requiredVersion) {
  console.error(
    `Web builds require Node ${requiredVersion.slice(1)}; found ${process.version.slice(1)}.`,
  );
  process.exit(1);
}
