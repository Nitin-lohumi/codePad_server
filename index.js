import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv"
const app = express();
const httpServer = http.createServer(app);
const Io = new Server(httpServer, { cors: { origin: "https://code-pad-weld.vercel.app" } });
dotenv.config();
app.use(express.json());
app.use(cors({
    origin: "https://code-pad-weld.vercel.app",
    methods: ["GET", "POST"]
}))

app.get("/", (req, res) => {
    res.json({ msg: "weclome to CodePad Server! " });
});
export const RoomNamespace = Io.of("/rooms");
const roomCodes = {};
const JoinedPeople = {};
const CodeOutput = {};
let admin;
RoomNamespace.on("connection", (socket) => {
    console.log("user is  connected", socket.id)
    socket.on("join-room", ({ RoomName, userName, isCreated }) => {
        if (!RoomName) return;
        socket.roomName = RoomName;
        socket.join(RoomName);
        if (!JoinedPeople[RoomName]) {
            admin = socket.id;
            JoinedPeople[RoomName] = [];
        }
        const alreadyJoined = JoinedPeople[RoomName].some(
            (user) => user.id === socket.id
        );
        if (!alreadyJoined) {
            JoinedPeople[RoomName].push({ id: socket.id, userName, msg: 0, chatOpen: false });
        }
        if (roomCodes[RoomName]) {
            socket.emit("init-code", roomCodes[RoomName]);
        }
        socket.to(RoomName).emit("userJoined", { id: socket.id, userName });
        socket.to(RoomName).emit("getUsers", JoinedPeople[RoomName] || []);
    });

    socket.on("CheckValidate", ({ RoomName, iscreate }) => {
        if (iscreate) {
            if (JoinedPeople[RoomName]) {
                socket.emit("check", false);
            } else {
                socket.emit("check", true);
            }
        } else {
            if (!JoinedPeople[RoomName]) {
                socket.emit("check", false);
            } else {
                socket.emit("check", true);

            }
        }
        console.log(JoinedPeople)
    })

    socket.on("language", ({ lang, roomId, code }) => {
        socket.to(roomId).emit("changelanguage", lang);
        roomCodes[roomId] = code;
        socket.broadcast.to(roomId).emit("code-change", roomCodes[roomId]);
    });

    socket.on("leave-room", ({ RoomName, userName }) => {
        if (!RoomName) RoomName = socket.roomName;
        if (!RoomName) return;

        if (socket.id == admin) {
            console.log("Admin  user is  disconnected", socket.id)
            if (JoinedPeople[RoomName]) delete JoinedPeople[RoomName];
            if (roomCodes[RoomName]) delete roomCodes[RoomName];
        }
        if (JoinedPeople[RoomName]) {
            JoinedPeople[RoomName] = JoinedPeople[RoomName].filter(
                (user) => user.id !== socket.id
            );
        }
        for (let roomID in JoinedPeople) {
            if (!JoinedPeople[roomID].length) {
                delete JoinedPeople[roomID];
                if (roomCodes[roomID]) delete roomCodes[roomID];
            }
        }
        console.log(" user is  disconnected", socket.id);
        Io.to(RoomName).emit("getUsers", JoinedPeople[RoomName] || []);
        if (socket.connected) {
            socket.leave(RoomName);
            socket.disconnect(true);
        }
    });

    socket.on("code-change", ({ RoomName, code }) => {
        roomCodes[RoomName] = code;
        socket.to(RoomName).emit("code-change", code);
    });

    socket.on("chatTabOpen", ({ ChatTabOpen, roomID }) => {
        if (!JoinedPeople[roomID]) return;
        for (let i = 0; i < JoinedPeople[roomID].length; i++) {
            if (JoinedPeople[roomID][i].id === socket.id) {
                JoinedPeople[roomID][i].chatOpen = ChatTabOpen;
            }
        }
    })

    socket.on("newMsg", ({ username, msg, roomID }) => {
        if (JoinedPeople[roomID]) {
            for (let i = 0; i < JoinedPeople[roomID].length; i++) {
                if (JoinedPeople[roomID][i].id !== socket.id && !JoinedPeople[roomID][i]?.chatOpen) {
                    JoinedPeople[roomID][i].msg++;
                }
            }
        };
        socket.to(roomID).emit("countMsg", JoinedPeople[roomID] || []);
        socket.broadcast.to(roomID).emit("getMsg", { username, msg, isMe: false });
    });
    socket.on("changeCount", (roomID) => {
        if (!JoinedPeople[roomID]) return;
        for (let i = 0; i < JoinedPeople[roomID].length; i++) {
            if (JoinedPeople[roomID][i].id === socket.id) {
                JoinedPeople[roomID][i].msg = 0;
            }
        }
        console.log("changeCount", JoinedPeople);
    });
    socket.on("totalUsers", (RoomName) => {
        socket.emit("getUsers", JoinedPeople[RoomName] || []);
    });

    socket.on("isCodeRun", ({ socketId, RoomName }) => {
        if (admin === socketId) {
            socket.to(RoomName).emit("runing", true);
        }
    })

    socket.on("runLoading", ({ load, roomID }) => {
        socket.to(roomID).emit("getloading", load);
    })

    socket.on("outputCode", ({ output, error, roomID }) => {
        CodeOutput[roomID] = { output, error };
        socket.to(roomID).emit("codeListen", CodeOutput[roomID]);
    })

    socket.on("disconnect", () => {
        const RoomName = socket.roomName;
        if (socket.id === admin) {
            if (RoomName && JoinedPeople[RoomName]) delete JoinedPeople[RoomName];
            if (RoomName && roomCodes[RoomName]) delete roomCodes[RoomName];
        } else {
            for (let roomID in JoinedPeople) {
                const list = JoinedPeople[roomID];
                if (!Array.isArray(list)) continue;
                JoinedPeople[roomID] = list.filter(
                    (user) => user.id !== socket.id
                );
                Io.to(roomID).emit("getUsers", JoinedPeople[roomID] || []);
            }
            for (let roomID in JoinedPeople) {
                if (!JoinedPeople[roomID].length) delete JoinedPeople[roomID]
            }
        }
        console.log("user is  disconnected", socket.id)
        try {
            if (socket.connected) socket.disconnect(true);
        } catch (_) { }
    });
});

app.post("/RunCode", async (req, res) => {
    const { code, languageId } = req.body;
    if (!code || !languageId) {
        return res.status(400).json({ error: "Code and languageId are required" });
    }
    try {
        const submissionResponse = await axios.post(
            "https://judge0-ce.p.rapidapi.com/submissions",
            {
                source_code: Buffer.from(code).toString("base64"),
                language_id: languageId
            },
            {
                params: { base64_encoded: "true", wait: "false" },
                headers: {
                    "x-rapidapi-key": process.env.KEY,
                    "x-rapidapi-host": process.env.HOST,
                    "content-type": "application/json"
                }
            }
        );

        const token = submissionResponse.data.token;
        if (!token) return res.status(500).json({ error: "Failed to get token" });

        await new Promise((r) => setTimeout(r, 2000));

        const resultResponse = await axios.get(
            `https://judge0-ce.p.rapidapi.com/submissions/${token}`,
            {
                params: { base64_encoded: "true", fields: "*" },
                headers: {
                    "x-rapidapi-key": process.env.KEY,
                    "x-rapidapi-host": process.env.HOST
                }
            }
        );

        const output = resultResponse.data.stdout
            ? Buffer.from(resultResponse.data.stdout, "base64").toString("utf-8")
            : "";
        const error = resultResponse.data.stderr
            ? Buffer.from(resultResponse.data.stderr, "base64").toString("utf-8")
            : "";
        res.json({ output, error });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Something went wrong" });
    }
});

httpServer.listen(process.env.PORT, () => {
    console.log("listen at port number -> 4000");
});