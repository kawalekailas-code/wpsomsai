import mongoose from "mongoose";
// One durable global sender lease. A restart never treats an in-flight request as unsent.
const schema = new mongoose.Schema({ _id: String, owner: String, until: Date }, { versionKey: false });
export default mongoose.model("WorkerLease", schema);
