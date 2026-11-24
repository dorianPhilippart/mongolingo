function toPlain(value) {
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.map(toPlain);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object") {
    if (typeof value.toHexString === "function") {
      return value.toHexString();
    }

    const output = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = toPlain(item);
    }
    return output;
  }

  return value;
}

function normalizeQueryText(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/;+$/g, "")
    .replace(/['\"]/g, "");
}

module.exports = {
  normalizeQueryText,
  toPlain,
};
