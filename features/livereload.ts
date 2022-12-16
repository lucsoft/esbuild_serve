export const isLiveReload = (r: Request) => r.url.includes("websocket-update");
export const liveReloadHookin = `;const refreshWs = new WebSocket(location.origin.replace("https", "wss").replace("http", "ws") + "/websocket-update"); refreshWs.onmessage = () => location.reload();`;

export function returnLiveReload(r: Request) {
    const ws = Deno.upgradeWebSocket(r);
    const caller = () => ws.socket.send("refresh");
    addEventListener('refresh', caller, { once: true });
    ws.socket.onclose = () => removeEventListener("refresh", caller);
    return ws.response;
}