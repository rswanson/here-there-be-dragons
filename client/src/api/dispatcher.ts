import type { ServerMessage } from '../types/ServerMessage';
import type { Handout } from '../types/Handout';
import type { Token } from '../types/Token';
import type { Drawing } from '../types/Drawing';
import type { Wall } from '../types/Wall';
import { useTokenStore } from '../state/tokens';
import { useDrawingStore } from '../state/drawings';
import { usePresenceStore } from '../state/presence';
import { useMapStore } from '../state/map';
import { useCharacterStore } from '../state/characters';
import { useChatStore } from '../state/chat';
import { useHandoutStore } from '../state/handouts';
import { useInitiativeStore } from '../state/initiative';
import { useWallStore } from '../state/walls';
import { useFogStore } from '../state/fog';
import { useVisionStore } from '../state/vision';

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
        const { map, layers, tokens, drawings, walls, fog_cells } = msg.payload;
        useMapStore.getState().loadMap(map, layers);
        useTokenStore.getState().loadTokens(tokens);
        useDrawingStore.getState().loadDrawings(drawings);
        if (walls) useWallStore.getState().loadWalls(walls);
        if (fog_cells) useFogStore.getState().loadRevealedCells(fog_cells);
        useVisionStore.getState().setDirty();
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

      // Chat messages
      case 'ChatMessageReceived': {
        const { message } = msg.payload;
        useChatStore.getState().handleIncomingMessage(message);
        break;
      }

      // Handout messages
      case 'HandoutCreated': {
        useHandoutStore.getState().handleHandoutCreated(msg.payload.handout as unknown as Handout);
        break;
      }
      case 'HandoutUpdated': {
        useHandoutStore.getState().handleHandoutUpdated(msg.payload.handout as unknown as Handout);
        break;
      }
      case 'HandoutDeleted': {
        useHandoutStore.getState().handleHandoutDeleted(msg.payload.handout_id);
        break;
      }

      // Initiative/encounter messages
      case 'EncounterStarted': {
        useInitiativeStore.getState().handleEncounterStarted(msg.payload.encounter);
        break;
      }
      case 'CombatantAdded': {
        useInitiativeStore.getState().handleCombatantAdded(msg.payload.combatant);
        break;
      }
      case 'CombatantRemoved': {
        useInitiativeStore.getState().handleCombatantRemoved(msg.payload.combatant_id);
        break;
      }
      case 'CombatantInitiativeUpdated': {
        const { combatant_id, initiative_value, sort_order } = msg.payload;
        useInitiativeStore.getState().handleCombatantInitiativeUpdated(combatant_id, initiative_value, sort_order);
        break;
      }
      case 'AllInitiativeRolled': {
        useInitiativeStore.getState().handleAllInitiativeRolled(msg.payload.combatants);
        break;
      }
      case 'TurnAdvanced': {
        const { current_turn_index, round_number } = msg.payload;
        useInitiativeStore.getState().handleTurnAdvanced(current_turn_index, round_number);
        break;
      }
      case 'EncounterEnded': {
        useInitiativeStore.getState().handleEncounterEnded();
        break;
      }

      // Wall messages
      case 'WallsCreated': {
        useWallStore.getState().addWalls(msg.payload.walls);
        useVisionStore.getState().setDirty();
        break;
      }
      case 'WallUpdated': {
        useWallStore.getState().updateWall(msg.payload.wall_id, msg.payload.patch as unknown as Partial<Wall>);
        useVisionStore.getState().setDirty();
        break;
      }
      case 'WallsDeleted': {
        useWallStore.getState().removeWalls(msg.payload.wall_ids);
        useVisionStore.getState().setDirty();
        break;
      }
      case 'DoorToggled': {
        useWallStore.getState().updateDoorState(msg.payload.wall_id, msg.payload.door_state);
        useVisionStore.getState().setDirty();
        break;
      }
      case 'DoorLocked': {
        break;
      }
      case 'FogRevealed': {
        if (msg.payload.revealed) {
          useFogStore.getState().revealCells(msg.payload.cells);
        } else {
          useFogStore.getState().hideCells(msg.payload.cells);
        }
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
