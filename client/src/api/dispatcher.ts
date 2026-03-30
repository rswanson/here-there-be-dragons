import type { ServerMessage } from '../types/ServerMessage';
import type { Token } from '../types/Token';
import type { Drawing } from '../types/Drawing';
import { useTokenStore } from '../state/tokens';
import { useDrawingStore } from '../state/drawings';
import { usePresenceStore } from '../state/presence';
import { useMapStore } from '../state/map';
import { useCharacterStore } from '../state/characters';

/**
 * Creates a message dispatcher that routes incoming server WebSocket messages
 * to the appropriate Zustand stores.
 */
export function createMessageDispatcher(): (msg: ServerMessage) => void {
  return (msg: ServerMessage) => {
    switch (msg.type) {
      // Token messages
      case 'TokenMoved': {
        const { token_id, x, y } = msg.payload;
        useTokenStore.getState().moveToken(token_id, x, y);
        break;
      }
      case 'TokenCreated': {
        useTokenStore.getState().addToken(msg.payload.token);
        break;
      }
      case 'TokenUpdated': {
        useTokenStore.getState().updateToken(
          msg.payload.token_id,
          msg.payload.patch as unknown as Partial<Token>,
        );
        break;
      }
      case 'TokenDeleted': {
        useTokenStore.getState().removeToken(msg.payload.token_id);
        break;
      }

      // Drawing messages
      case 'DrawingCreated': {
        useDrawingStore.getState().addDrawing(msg.payload.drawing);
        break;
      }
      case 'DrawingUpdated': {
        useDrawingStore.getState().updateDrawing(
          msg.payload.drawing_id,
          msg.payload.patch as unknown as Partial<Drawing>,
        );
        break;
      }
      case 'DrawingDeleted': {
        useDrawingStore.getState().removeDrawing(msg.payload.drawing_id);
        break;
      }

      // Presence messages
      case 'SessionJoined':
      case 'UserJoined':
      case 'UserLeft': {
        usePresenceStore.getState().handleServerMessage(msg);
        break;
      }

      // Full state sync
      case 'FullState': {
        const { map, layers, tokens, drawings } = msg.payload;
        useMapStore.getState().loadMap(map, layers);
        useTokenStore.getState().loadTokens(tokens);
        useDrawingStore.getState().loadDrawings(drawings);
        break;
      }

      // Layer messages
      case 'LayerCreated': {
        useMapStore.getState().addLayer(msg.payload.layer);
        break;
      }
      case 'LayerUpdated': {
        useMapStore.getState().updateLayer(msg.payload.layer.id, msg.payload.layer);
        break;
      }
      case 'LayerDeleted': {
        useMapStore.getState().removeLayer(msg.payload.layer_id);
        break;
      }
      case 'LayersReordered': {
        useMapStore.getState().reorderLayers(msg.payload.layer_ids);
        break;
      }

      // Character messages
      case 'CharacterFieldsUpdated': {
        const { character_id, fields } = msg.payload;
        useCharacterStore.getState().handleFieldsUpdated(character_id, fields);
        break;
      }
      case 'CharacterBonusAdded': {
        const { character_id, field_id, bonus } = msg.payload;
        useCharacterStore.getState().handleBonusAdded(character_id, field_id, bonus);
        break;
      }
      case 'CharacterBonusRemoved': {
        const { character_id, bonus_id, field_id } = msg.payload;
        useCharacterStore.getState().handleBonusRemoved(character_id, bonus_id, field_id);
        break;
      }
      case 'CharacterBonusUpdated': {
        const { character_id, field_id, bonus } = msg.payload;
        useCharacterStore.getState().handleBonusUpdated(character_id, field_id, bonus);
        break;
      }
      case 'TokenCharacterLinked': {
        break;
      }

      // No-op messages (handled elsewhere or not yet implemented)
      case 'Pong':
      case 'Error':
      case 'MapImagePlaced':
      case 'MapImageUpdated':
      case 'MapImageDeleted':
        break;
    }
  };
}
