// import { Room } from "../index.js"
// import { Router } from "express";
// const roomRoute = Router();
// roomRoute.get("/rooms/:roomId", (req, res) => {
//     console.log(req.params);
// });
// Room.on("disconnect", (socket) => {
//     console.log("discoonnect", socket.id);
// });
// export default roomRoute;

import { RoomNamespace } from "../index.js";
console.log(RoomNamespace);