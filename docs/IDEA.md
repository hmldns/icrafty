
Web app that help people craft small things for fixing or improve their stuff with 3d printing.

App should engage with user interaction, get camera shapshots when user shows a thing to fix, then app does drafts, keep interacting to get real dimentions and shape. 
THen app must create freecad python declarative part code and generate step file, this process should output STEP file; 

all that should be arranged in interactive mode wihtin chat, including 3d model.

Then 3d model should be possible to shapshot and give hand drawed annotations and texts. Same for drafts. User edits that and then be amble to sumbit image to llm for further processing.

It need  to have interactive chat that is pulling and interacting with codex via Agent Connection Protocol (ACP) when codex will be activated with MCPS that.
Project should be having chats and these chats should vizualize acp transactions nicely, and mcp tools calls should be visible and interactive frontned components that either viz things or help navigate. All acp viweable things are good to vizualize too, such as other tool calls or thoguths. I did that before, so can provide references.


Outcome is step file and printed part. 

Thing should be designed to be multiuser but we will not implement that right away with authrozation, etc; 

That is hackathon day so we are constrained and should be very pragmatic.

We need to deploy this and will do that in digital ocean with domain icrafty.ai that I just purchased.

We need to use python backend, freecad, be ready to print things using bambu lab 3d printer.
For frontend we use TS, React, vite, Tailwind, ThreeJS and usefull react binding if nescessary.

Docker, docker compose, caddy for connecting things. 
We will authorize codex on server.
Need to launch codex in container within mounted creds and directories. And still be able to stream things. 

Freecad container and service should be isolated (memory constarainted) and give API to do things.

All images / assets should be able to go back and forth as filex accessible by agent and pullable via backend, so then it might be S3 relay. Kind of file service. 


