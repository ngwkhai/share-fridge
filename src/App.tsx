import React, { useState, useEffect, useCallback } from 'react';
import { api } from './services/api';
import { FoodItem, RoomDetail, CreateFoodDto, ParsedFoodItem, RecipeSuggestion, ShoppingItem } from './types';
import { Header } from './components/Header';
import { PulseStrip } from './components/PulseStrip';
import { FilterBar, FilterCategory } from './components/FilterBar';
import { FoodCard } from './components/FoodCard';
import { QuickAddModal } from './components/QuickAddModal';
import { VoiceInputModal } from './components/VoiceInputModal';
import { RecipeModal } from './components/RecipeModal';
import { ShoppingListTab } from './components/ShoppingListTab';
import { BottomNav, TabType } from './components/BottomNav';
import { NotificationModal } from './components/NotificationModal';
import { SettingsModal } from './components/SettingsModal';
import { GoogleAuthButton, GoogleUserProfile } from './components/GoogleAuthButton';
import { createRealtimeSubscription } from './services/supabaseClient';
import { PlusCircle, Search, Lock, User, ArrowRight } from 'lucide-react';

export default function App() {
  // SWR Instant Boot from Session Cache
  const initialCache = api.sessionCache.get();
  const [roomCode, setRoomCode] = useState<string>(() => initialCache?.code || '');
  const [room, setRoom] = useState<RoomDetail | null>(() => {
    if (initialCache) {
      return {
        id: `room-${initialCache.code}`,
        code: initialCache.code,
        name: initialCache.name,
        created_at: new Date(initialCache.cached_at).toISOString(),
        active_food_count: 0,
        urgent_food_count: 0
      };
    }
    return null;
  });
  const [currentPasscode, setCurrentPasscode] = useState<string>(() => initialCache?.passcode || '1234');
  const [currentNickname, setCurrentNickname] = useState<string>(() => initialCache?.nickname || 'Khải');
  const [googleEmail, setGoogleEmail] = useState<string | undefined>(() => initialCache?.google_email);
  const [userAvatar, setUserAvatar] = useState<string | undefined>(() => initialCache?.user_avatar);

  // Local-First Persistent State Initialization
  const [foods, setFoods] = useState<FoodItem[]>(() => (initialCache?.code ? api.foodCache.getFoods(initialCache.code) : []));
  const [consumedFoods, setConsumedFoods] = useState<FoodItem[]>(() => (initialCache?.code ? api.foodCache.getConsumed(initialCache.code) : []));
  const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>(() => (initialCache?.code ? api.foodCache.getShopping(initialCache.code) : []));

  const [activeFilter, setActiveFilter] = useState<FilterCategory>('ALL');
  const [currentTab, setCurrentTab] = useState<TabType>('FRIDGE');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [isRecipeOpen, setIsRecipeOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [voiceDraftData, setVoiceDraftData] = useState<Partial<CreateFoodDto> | undefined>(undefined);

  // Setup / Join Room State
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [inputCode, setInputCode] = useState('');
  const [inputPasscode, setInputPasscode] = useState('');
  const [inputNickname, setInputNickname] = useState('Khải');
  const [newRoomName, setNewRoomName] = useState('Phòng 302');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Load Room Data with Local-First Guard
  const loadData = useCallback(async (code: string) => {
    if (!code) return;
    try {
      const roomData = await api.getRoom(code);
      setRoom(roomData);
      setRoomCode(code);

      const [activeData, consumedData, shopData] = await Promise.all([
        api.getFoods(code, 'active'),
        api.getFoods(code, 'consumed'),
        api.getShoppingItems(code)
      ]);

      // Guard against cold-start empty returns
      if (activeData.items.length > 0) {
        setFoods(activeData.items);
        api.foodCache.saveFoods(code, activeData.items);
      } else {
        const cached = api.foodCache.getFoods(code);
        if (cached.length > 0) {
          setFoods(cached);
          // Silently re-seed serverless memory
          for (const f of cached) {
            api.addFood({
              room_code: code,
              name: f.name,
              quantity: f.quantity,
              compartment: f.compartment,
              container_tag: f.container_tag,
              shelf_life_days: f.days_remaining || 3,
              photo_url: f.photo_url,
              created_by: f.created_by
            }).catch(() => {});
          }
        }
      }

      if (consumedData.items.length > 0) {
        setConsumedFoods(consumedData.items);
        api.foodCache.saveConsumed(code, consumedData.items);
      }

      if (shopData.items.length > 0) {
        setShoppingItems(shopData.items);
        api.foodCache.saveShopping(code, shopData.items);
      } else {
        const cachedShop = api.foodCache.getShopping(code);
        if (cachedShop.length > 0) {
          setShoppingItems(cachedShop);
        }
      }
    } catch (err: any) {
      console.warn('Silent data load issue:', err);
    }
  }, []);

  // Background SWR Verification
  useEffect(() => {
    if (roomCode) {
      loadData(roomCode);
      api.verifyToken().then((res) => {
        if (!res.valid && !initialCache) {
          handleLogout();
        }
      }).catch(() => {});
    }
  }, [roomCode, loadData]);

  // Realtime subscription with Local-First Guard (no flashing)
  useEffect(() => {
    if (!roomCode || !room) return;
    const unsubscribe = createRealtimeSubscription(
      roomCode,
      () => {
        api.getFoods(roomCode, 'active').then((res) => {
          if (res.items.length > 0) {
            setFoods(res.items);
            api.foodCache.saveFoods(roomCode, res.items);
          }
        }).catch(() => {});
      },
      () => {
        api.getShoppingItems(roomCode).then((res) => {
          if (res.items.length > 0) {
            setShoppingItems(res.items);
            api.foodCache.saveShopping(roomCode, res.items);
          }
        }).catch(() => {});
      }
    );
    return () => unsubscribe();
  }, [roomCode, room]);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const pCode = inputPasscode.trim() || '1234';
      const rName = newRoomName.trim() || 'Phòng mới';
      const nick = inputNickname.trim() || 'Khải';

      const result = await api.createRoomWithPasscode(undefined, rName, pCode, nick);

      const newRoom: RoomDetail = {
        id: result.room.id,
        code: result.room.code,
        name: result.room.name,
        created_at: result.room.created_at,
        active_food_count: 0,
        urgent_food_count: 0
      };

      setRoom(newRoom);
      setRoomCode(result.room.code);
      setCurrentPasscode(pCode);
      setCurrentNickname(nick);
      setFoods([]);
      setConsumedFoods([]);
      setShoppingItems([]);
      api.foodCache.saveFoods(result.room.code, []);
      api.foodCache.saveShopping(result.room.code, []);

      loadData(result.room.code);
    } catch (err: any) {
      setError(err.message || 'Lỗi tạo phòng');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputCode.trim()) return;
    setLoading(true);
    setError('');
    try {
      const pCode = inputPasscode.trim() || '1234';
      const nick = inputNickname.trim() || 'Khải';

      const result = await api.joinRoomWithPasscode(inputCode.trim(), pCode, nick);

      const joinedRoom: RoomDetail = {
        id: result.room.id,
        code: result.room.code,
        name: result.room.name,
        created_at: result.room.created_at,
        active_food_count: 0,
        urgent_food_count: 0
      };

      setRoom(joinedRoom);
      setRoomCode(result.room.code);
      setCurrentPasscode(pCode);
      setCurrentNickname(nick);

      await loadData(result.room.code);
    } catch (err: any) {
      setError(err.message || 'Không thể tham gia phòng');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    api.sessionCache.clear();
    setRoom(null);
    setRoomCode('');
    setCurrentPasscode('1234');
    setGoogleEmail(undefined);
    setUserAvatar(undefined);
    setFoods([]);
    setConsumedFoods([]);
    setShoppingItems([]);
  };

  const handleGoogleSuccess = (profile: GoogleUserProfile) => {
    setCurrentNickname(profile.name);
    setInputNickname(profile.name);
    setUserAvatar(profile.picture);
    setGoogleEmail(profile.email);
    const cache = api.sessionCache.get();
    if (cache) {
      api.sessionCache.save({
        ...cache,
        nickname: profile.name,
        google_email: profile.email,
        user_avatar: profile.picture
      });
    }
  };

  const handleUpdateNickname = (newNick: string) => {
    setCurrentNickname(newNick);
    const cache = api.sessionCache.get();
    if (cache) {
      api.sessionCache.save({ ...cache, nickname: newNick });
    }
  };

  // Actions
  const handleAddFood = async (dto: CreateFoodDto) => {
    const newFood = await api.addFood({ ...dto, created_by: currentNickname });
    setFoods(prev => {
      const updated = [newFood, ...prev];
      api.foodCache.saveFoods(roomCode, updated);
      return updated;
    });
    setVoiceDraftData(undefined);
  };

  const handleConsumeFood = async (id: string) => {
    const updated = await api.consumeFood(id, undefined, true);
    setFoods(prev => {
      const filtered = prev.filter(f => f.id !== id);
      api.foodCache.saveFoods(roomCode, filtered);
      return filtered;
    });
    setConsumedFoods(prev => {
      const updatedConsumed = [updated, ...prev];
      api.foodCache.saveConsumed(roomCode, updatedConsumed);
      return updatedConsumed;
    });
    const shopData = await api.getShoppingItems(roomCode);
    if (shopData.items.length > 0) {
      setShoppingItems(shopData.items);
      api.foodCache.saveShopping(roomCode, shopData.items);
    }
  };

  const handleDeleteFood = async (id: string) => {
    await api.deleteFood(id);
    setFoods(prev => {
      const filtered = prev.filter(f => f.id !== id);
      api.foodCache.saveFoods(roomCode, filtered);
      return filtered;
    });
    setConsumedFoods(prev => {
      const filtered = prev.filter(f => f.id !== id);
      api.foodCache.saveConsumed(roomCode, filtered);
      return filtered;
    });
  };

  const handleVoiceParsed = (parsed: ParsedFoodItem) => {
    setVoiceDraftData({
      name: parsed.name,
      quantity: parsed.quantity,
      compartment: parsed.compartment as any,
      container_tag: parsed.container_tag,
      shelf_life_days: parsed.shelf_life_days,
      created_by: currentNickname
    });
    setIsQuickAddOpen(true);
  };

  const handleCookRecipe = async (recipe: RecipeSuggestion) => {
    for (const name of recipe.ingredients_used) {
      const match = foods.find(f => f.name.toLowerCase().includes(name.toLowerCase()));
      if (match) {
        await api.consumeFood(match.id, undefined, false);
      }
    }
    await loadData(roomCode);
  };

  const handleAddShoppingItem = async (name: string, quantity?: string) => {
    const item = await api.addShoppingItem({ room_code: roomCode, name, quantity });
    setShoppingItems(prev => {
      const updated = [item, ...prev];
      api.foodCache.saveShopping(roomCode, updated);
      return updated;
    });
  };

  const handleToggleShoppingItem = async (id: string, isBought: boolean) => {
    const updated = await api.toggleShoppingItem(id, isBought);
    setShoppingItems(prev => {
      const list = prev.map(i => (i.id === id ? updated : i));
      api.foodCache.saveShopping(roomCode, list);
      return list;
    });
  };

  const handleDeleteShoppingItem = async (id: string) => {
    await api.deleteShoppingItem(id);
    setShoppingItems(prev => {
      const filtered = prev.filter(i => i.id !== id);
      api.foodCache.saveShopping(roomCode, filtered);
      return filtered;
    });
  };

  // Filter & Search Logic
  const filteredFoods = foods.filter(food => {
    if (searchQuery.trim() && !food.name.toLowerCase().includes(searchQuery.toLowerCase().trim())) {
      return false;
    }
    switch (activeFilter) {
      case 'URGENT':
        return food.status === 'COOK_SOON' || food.status === 'EXPIRED';
      case 'FREEZER':
        return food.compartment === 'FREEZER';
      case 'FRIDGE':
        return food.compartment === 'FRIDGE_TOP' || food.compartment === 'FRIDGE_BOTTOM';
      case 'CRISPER':
        return food.compartment === 'CRISPER';
      case 'DOOR':
        return food.compartment === 'DOOR';
      default:
        return true;
    }
  });

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto shadow-2xl border-x border-slate-200/60 pb-24 relative overflow-hidden">
      {/* Header */}
      {room && (
        <Header
          roomCode={room.code}
          roomName={room.name}
          nickname={currentNickname}
          userAvatar={userAvatar}
          onRefresh={() => loadData(room.code)}
          onChangeRoom={handleLogout}
          onOpenNotifications={() => setIsNotifOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          loading={loading}
        />
      )}

      {/* Main Body */}
      <main className="flex-1 p-4 space-y-4">
        {!room ? (
          /* Sleek Minimalist Auth Screen with 3D Logo */
          <div className="glass-card rounded-3xl p-6 shadow-xl space-y-5 my-auto text-center">
            <div className="flex flex-col items-center gap-2.5">
              <div className="relative">
                <img
                  src={userAvatar || '/logo.jpg'}
                  alt="ShareFridge Logo"
                  className="w-20 h-20 rounded-3xl object-cover ring-4 ring-fresh-400/50 shadow-xl"
                />
                <span className="absolute -bottom-1 -right-1 w-5 h-5 bg-fresh-500 border-2 border-white rounded-full"></span>
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">ShareFridge</h2>
                <p className="text-xs font-semibold text-slate-500">Tủ Lạnh Phòng Trọ</p>
              </div>
            </div>

            {/* Google Sign-In One-Click */}
            <div className="space-y-3">
              <GoogleAuthButton onSuccess={handleGoogleSuccess} />
              
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-slate-200"></div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">hoặc mã PIN</span>
                <div className="flex-1 h-px bg-slate-200"></div>
              </div>
            </div>

            {!isCreateMode ? (
              <form onSubmit={handleJoinRoom} className="space-y-3.5 text-left">
                <div>
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="Mã PIN 6 số (VD: 123456)"
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value)}
                    className="w-full text-center text-lg tracking-widest font-mono font-bold py-3 px-3 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-fresh-500 focus:outline-none glass-input"
                    autoFocus
                  />
                </div>

                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="password"
                    placeholder="Mật khẩu phòng (Passcode)"
                    value={inputPasscode}
                    onChange={(e) => setInputPasscode(e.target.value)}
                    className="w-full pl-10 pr-3 py-3 border border-slate-200 rounded-2xl text-sm font-mono focus:ring-2 focus:ring-fresh-500 focus:outline-none glass-input"
                  />
                </div>

                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    placeholder="Tên của bạn"
                    value={inputNickname}
                    onChange={(e) => setInputNickname(e.target.value)}
                    className="w-full pl-10 pr-3 py-3 border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-fresh-500 focus:outline-none glass-input"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || !inputCode.trim()}
                  className="w-full py-3.5 bg-gradient-to-r from-fresh-600 to-emerald-500 hover:from-fresh-500 hover:to-emerald-400 disabled:opacity-50 text-white font-extrabold rounded-2xl text-sm transition-all shadow-lg flex items-center justify-center gap-1.5 active:scale-98"
                >
                  <span>{loading ? 'Đang kết nối...' : 'Vào tủ lạnh'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            ) : (
              <form onSubmit={handleCreateRoom} className="space-y-3.5 text-left">
                <input
                  type="text"
                  placeholder="Tên phòng (VD: Phòng 302)"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  className="w-full py-3 px-4 border border-slate-200 rounded-2xl text-sm font-semibold focus:ring-2 focus:ring-fresh-500 focus:outline-none glass-input"
                  required
                />

                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="password"
                    placeholder="Mật khẩu bảo vệ (Passcode 4 số)"
                    value={inputPasscode}
                    onChange={(e) => setInputPasscode(e.target.value)}
                    className="w-full pl-10 pr-3 py-3 border border-slate-200 rounded-2xl text-sm font-mono focus:ring-2 focus:ring-fresh-500 focus:outline-none glass-input"
                    required
                  />
                </div>

                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    placeholder="Tên của bạn"
                    value={inputNickname}
                    onChange={(e) => setInputNickname(e.target.value)}
                    className="w-full pl-10 pr-3 py-3 border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-fresh-500 focus:outline-none glass-input"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 bg-gradient-to-r from-fresh-600 to-emerald-500 hover:from-fresh-500 hover:to-emerald-400 disabled:opacity-50 text-white font-extrabold rounded-2xl text-sm transition-all shadow-lg active:scale-98"
                >
                  {loading ? 'Đang tạo...' : 'Tạo phòng mới'}
                </button>
              </form>
            )}

            <button
              type="button"
              onClick={() => { setIsCreateMode(!isCreateMode); setError(''); }}
              className="w-full py-2 text-slate-600 hover:text-slate-900 font-bold text-xs flex items-center justify-center gap-1 transition-colors"
            >
              <span>{isCreateMode ? 'Đã có mã? Vào phòng' : 'Tạo phòng mới cho 2 người'}</span>
            </button>

            {error && (
              <div className="p-3 bg-danger-500/10 text-danger-700 text-xs rounded-2xl border border-danger-200 font-semibold">
                {error}
              </div>
            )}
          </div>
        ) : (
          /* Active Tabs */
          <>
            {currentTab === 'FRIDGE' && (
              <div className="space-y-4">
                {/* Pulse Strip */}
                <PulseStrip
                  foods={foods}
                  shoppingCount={shoppingItems.filter(i => !i.is_bought).length}
                  onFilterClick={(cat) => {
                    if (cat === 'SHOPPING') setCurrentTab('SHOPPING');
                    else setActiveFilter(cat as FilterCategory);
                  }}
                />

                {/* Search Bar */}
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Tìm nhanh trong tủ..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 rounded-2xl text-xs font-semibold focus:ring-2 focus:ring-fresh-500 focus:outline-none glass-input shadow-2xs"
                  />
                </div>

                {/* Filter Bar */}
                <FilterBar
                  activeFilter={activeFilter}
                  onSelectFilter={setActiveFilter}
                />

                {/* Food List */}
                <div className="space-y-2.5">
                  {filteredFoods.length === 0 ? (
                    <div className="py-14 glass-card rounded-3xl text-center space-y-3 p-6">
                      <div className="w-14 h-14 bg-fresh-500/10 text-fresh-600 rounded-3xl flex items-center justify-center mx-auto text-3xl">
                        🥗
                      </div>
                      <div className="space-y-0.5">
                        <h4 className="font-extrabold text-slate-800 text-sm">Chưa có món nào ở mục này</h4>
                      </div>
                      <button
                        onClick={() => setIsQuickAddOpen(true)}
                        className="px-4 py-2.5 bg-gradient-to-r from-fresh-600 to-emerald-500 text-white font-bold rounded-xl text-xs inline-flex items-center gap-1.5 shadow-md active:scale-95"
                      >
                        <PlusCircle className="w-4 h-4" />
                        <span>Thêm món ngay</span>
                      </button>
                    </div>
                  ) : (
                    filteredFoods.map((food) => (
                      <FoodCard
                        key={food.id}
                        food={food}
                        onConsume={handleConsumeFood}
                        onDelete={handleDeleteFood}
                      />
                    ))
                  )}
                </div>
              </div>
            )}

            {currentTab === 'SHOPPING' && (
              <ShoppingListTab
                items={shoppingItems}
                onAddItem={handleAddShoppingItem}
                onToggleItem={handleToggleShoppingItem}
                onDeleteItem={handleDeleteShoppingItem}
              />
            )}

            {currentTab === 'HISTORY' && (
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
                  Đã dùng ({consumedFoods.length})
                </h3>
                {consumedFoods.length === 0 ? (
                  <div className="py-12 glass-card rounded-2xl text-center text-xs text-slate-400 font-semibold p-4">
                    Chưa có món nào đã nấu
                  </div>
                ) : (
                  <div className="space-y-2 opacity-80">
                    {consumedFoods.map((food) => (
                      <div key={food.id} className="glass-card p-3 rounded-2xl flex items-center justify-between">
                        <div>
                          <div className="font-bold text-sm text-slate-800 line-through">{food.name}</div>
                          <div className="text-[11px] text-slate-400 font-medium">{food.compartment}</div>
                        </div>
                        <button
                          onClick={() => handleDeleteFood(food.id)}
                          className="text-xs text-slate-400 hover:text-danger-600 font-semibold"
                        >
                          Xóa
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Bottom Sticky Floating White Dock */}
      {room && (
        <BottomNav
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
          onOpenQuickAdd={() => setIsQuickAddOpen(true)}
          onOpenVoice={() => setIsVoiceOpen(true)}
          onOpenRecipe={() => setIsRecipeOpen(true)}
        />
      )}

      {/* Modals */}
      <QuickAddModal
        isOpen={isQuickAddOpen}
        onClose={() => { setIsQuickAddOpen(false); setVoiceDraftData(undefined); }}
        onAdd={handleAddFood}
        roomCode={roomCode}
        nickname={currentNickname}
        initialData={voiceDraftData}
      />

      <VoiceInputModal
        isOpen={isVoiceOpen}
        onClose={() => setIsVoiceOpen(false)}
        onParsed={handleVoiceParsed}
      />

      <RecipeModal
        isOpen={isRecipeOpen}
        onClose={() => setIsRecipeOpen(false)}
        roomCode={roomCode}
        onCookRecipe={handleCookRecipe}
      />

      <NotificationModal
        isOpen={isNotifOpen}
        onClose={() => setIsNotifOpen(false)}
        roomCode={roomCode}
      />

      {room && (
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          roomCode={room.code}
          roomName={room.name}
          passcode={currentPasscode}
          nickname={currentNickname}
          googleEmail={googleEmail}
          onUpdateNickname={handleUpdateNickname}
          onLogout={handleLogout}
        />
      )}
    </div>
  );
}
