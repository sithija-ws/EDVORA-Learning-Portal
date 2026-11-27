export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("next/")) {
    return nextResolve(specifier + ".js", context);
  }
  if (specifier.startsWith("@/")) {
    const raw = "../../" + specifier.slice(2);
    const target = new URL(raw, import.meta.url).href;
    const resolvedPath = target.endsWith(".ts") || target.endsWith(".js") ? target : target + ".ts";
    return nextResolve(resolvedPath, context);
  }
  return nextResolve(specifier, context);
}
