import { createGajumaruClient, openDesktopWithGrids } from "@gajumaru/dapp";
import { createDeadDropUrl } from "@gajumaru/grids";

const log = document.getElementById("log")!;
const client = createGajumaruClient();

function write(value: unknown) {
  log.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

document.getElementById("connect")!.onclick = async () => {
  try {
    write(await client.connect());
  } catch (error) {
    write((error as Error).message);
  }
};

document.getElementById("sign")!.onclick = async () => {
  try {
    write(await client.signMessage("Login to Kiji demo"));
  } catch (error) {
    write((error as Error).message);
  }
};

document.getElementById("send")!.onclick = async () => {
  try {
    const to = (document.getElementById("to") as HTMLInputElement).value;
    const amount = (document.getElementById("amount") as HTMLInputElement).value;
    write(await client.send({ to, amount }));
  } catch (error) {
    write((error as Error).message);
  }
};

document.getElementById("grids-sign")!.onclick = async () => {
  try {
    const created = (await fetch("/grids/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "message", payload: "Login to Kiji demo" })
    }).then((response) => response.json())) as { id: string };
    const gridsUrl = createDeadDropUrl({
      host: "127.0.0.1",
      port: 5174,
      path: `grids/request/${created.id}`
    });
    write(`Opening desktop wallet…\n${gridsUrl}`);
    const timer = window.setInterval(async () => {
      const record = (await fetch(`/grids/request/${created.id}`).then((response) =>
        response.json()
      )) as { status?: string; signature?: unknown };
      if (record.status === "signed") {
        window.clearInterval(timer);
        write(record.signature ?? record);
      }
    }, 1000);
    openDesktopWithGrids(gridsUrl);
  } catch (error) {
    write((error as Error).message);
  }
};
