use axum::{
    Router,
    extract::{
        State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    response::IntoResponse,
    routing::get,
};
use futures_util::{SinkExt, StreamExt};

use crate::state::AppState;
use htbd_core::messages::{ClientMessage, ServerMessage};

pub fn routes() -> Router<AppState> {
    Router::new().route("/", get(ws_upgrade))
}

async fn ws_upgrade(ws: WebSocketUpgrade, State(_state): State<AppState>) -> impl IntoResponse {
    ws.on_upgrade(handle_socket)
}

async fn handle_socket(mut socket: WebSocket) {
    while let Some(Ok(msg)) = socket.next().await {
        match msg {
            Message::Text(text) => {
                let parsed: Result<ClientMessage, _> = serde_json::from_str(&text);
                match parsed {
                    Ok(ClientMessage::Ping) => {
                        let response = serde_json::to_string(&ServerMessage::Pong).unwrap();
                        if socket.send(Message::Text(response.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(e) => {
                        let error = ServerMessage::Error {
                            code: "INVALID_MESSAGE".to_string(),
                            message: e.to_string(),
                        };
                        let response = serde_json::to_string(&error).unwrap();
                        if socket.send(Message::Text(response.into())).await.is_err() {
                            break;
                        }
                    }
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }
}
