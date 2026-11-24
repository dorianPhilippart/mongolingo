async function executeOperation(db, spec) {
  const {
    collection,
    operation,
    filter = {},
    projection,
    sort,
    limit,
    pipeline,
    field,
    update,
    data,
    options,
  } = spec || {};

  if (!collection || !operation) {
    throw new Error("Spec invalide: collection et operation sont requis.");
  }

  const col = db.collection(collection);

  switch (operation) {
    case "find": {
      let cursor = col.find(filter, projection ? { projection } : {});
      if (sort) cursor = cursor.sort(sort);
      if (typeof limit === "number") cursor = cursor.limit(limit);
      return cursor.toArray();
    }
    case "findOne":
      return col.findOne(filter, projection ? { projection } : {});
    case "aggregate":
      return col.aggregate(pipeline || []).toArray();
    case "countDocuments":
      return col.countDocuments(filter || {});
    case "distinct":
      return col.distinct(field, filter || {});
    case "insertOne":
      return col.insertOne(data || {});
    case "updateMany":
      return col.updateMany(filter || {}, update || {}, options || {});
    case "deleteMany":
      return col.deleteMany(filter || {});
    default:
      throw new Error(`Operation non supportee: ${operation}`);
  }
}

module.exports = {
  executeOperation,
};
