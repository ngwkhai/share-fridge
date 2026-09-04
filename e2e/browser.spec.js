import { test, expect } from '@playwright/test';

const randomCode = () => Math.floor(100000 + Math.random() * 900000).toString();
const randomPass = () => Math.floor(1000 + Math.random() * 9000).toString();

test.describe('ShareFridge Browser Journeys', () => {

  test('Full roommate flow: create room -> add food -> consume -> shopping list -> delete', async ({ page }) => {
    const roomName = `Phòng Test ${randomCode()}`;
    const passcode = randomPass();
    const foodName = `Thịt bò ${randomCode()}`;
    const nickname = 'Roommate A';

    // 1. Navigate to home
    await page.goto('/');

    // Switch to create room mode if not already
    const createRoomToggle = page.locator('button:has-text("Tạo phòng mới cho 2 người")');
    if (await createRoomToggle.isVisible()) {
      await createRoomToggle.click();
    }

    // Fill Create Room form
    await page.fill('input[placeholder*="Tên phòng"]', roomName);
    await page.fill('input[placeholder*="Mật khẩu bảo vệ"]', passcode);
    await page.fill('input[placeholder*="Tên của bạn"]', nickname);
    await page.click('button[type="submit"]:has-text("Tạo phòng mới")');

    // Wait for room header to be visible
    await expect(page.locator(`text=${roomName}`).first()).toBeVisible({ timeout: 15000 });

    // 2. Add food via QuickAddModal
    await page.click('button[aria-label="Thêm món mới"]');
    await expect(page.locator('#quick-add-title')).toBeVisible();

    await page.fill('input[placeholder*="Tên thực phẩm"]', foodName);
    await page.fill('input[aria-label="Số lượng"]', '500g');
    await page.fill('input[aria-label="Dấu hiệu nhận biết"]', 'Hộp xanh');
    await page.click('button[type="submit"]:has-text("Lưu vào tủ")');

    // Verify food appears in list
    const addedFoodCard = page.locator('.glass-card', { hasText: foodName });
    await expect(addedFoodCard).toBeVisible({ timeout: 10000 });

    // 3. Consume food ("Đã nấu")
    await addedFoodCard.locator('button:has-text("Đã nấu")').click();

    // Food item should disappear from active fridge tab
    await expect(page.locator('.glass-card', { hasText: foodName })).not.toBeVisible({ timeout: 10000 });

    // 4. Verify in Shopping List tab
    await page.click('button:has-text("Đi chợ")');
    const shopItem = page.locator('div.bg-white', { hasText: foodName });
    await expect(shopItem).toBeVisible({ timeout: 10000 });

    // Delete shopping item
    await shopItem.locator('button:has(svg.lucide-trash-2)').click();
    await expect(page.locator('div.bg-white', { hasText: foodName })).not.toBeVisible({ timeout: 10000 });

    // 5. Verify in History tab
    await page.click('button:has-text("Đã dùng")');
    const historyItem = page.locator('div.glass-card', { hasText: foodName });
    if (await historyItem.isVisible()) {
      await historyItem.locator('button:has-text("Xóa")').click();
      const confirmModal = page.locator('[role="dialog"]');
      if (await confirmModal.isVisible()) {
        await confirmModal.locator('button:has-text("Xóa món")').click();
        await expect(confirmModal).not.toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('Two isolated contexts: Roommate A creates room, Roommate B joins same room', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    const roomName = `Chung ${randomCode()}`;
    const passcode = randomPass();
    const foodName = `Rau củ ${randomCode()}`;

    // Roommate A creates room
    await pageA.goto('/');
    const toggleA = pageA.locator('button:has-text("Tạo phòng mới cho 2 người")');
    if (await toggleA.isVisible()) {
      await toggleA.click();
    }
    await pageA.fill('input[placeholder*="Tên phòng"]', roomName);
    await pageA.fill('input[placeholder*="Mật khẩu bảo vệ"]', passcode);
    await pageA.fill('input[placeholder*="Tên của bạn"]', 'Roommate A');
    await pageA.click('button[type="submit"]:has-text("Tạo phòng mới")');

    await expect(pageA.locator(`text=${roomName}`).first()).toBeVisible({ timeout: 15000 });

    // Extract 6-digit room code from Header button with #
    const roomCodeButton = pageA.locator('header button:has-text("#")');
    await expect(roomCodeButton).toBeVisible();
    const codeText = await roomCodeButton.innerText();
    const match = codeText.match(/#(\d{6})/);
    expect(match).not.toBeNull();
    const roomCode = match[1];

    // Roommate A adds food
    await pageA.click('button[aria-label="Thêm món mới"]');
    await expect(pageA.locator('#quick-add-title')).toBeVisible();
    await pageA.fill('input[placeholder*="Tên thực phẩm"]', foodName);
    await pageA.click('button[type="submit"]:has-text("Lưu vào tủ")');
    await expect(pageA.locator('.glass-card', { hasText: foodName })).toBeVisible({ timeout: 10000 });

    // Roommate B joins the same room in isolated context
    await pageB.goto('/');
    const toggleB = pageB.locator('button:has-text("Đã có mã? Vào phòng")');
    if (await toggleB.isVisible()) {
      await toggleB.click();
    }
    await pageB.fill('input[placeholder*="Mã PIN 6 số"]', roomCode);
    await pageB.fill('input[placeholder*="Mật khẩu phòng"]', passcode);
    await pageB.fill('input[placeholder*="Tên của bạn"]', 'Roommate B');
    await pageB.click('button[type="submit"]:has-text("Vào tủ lạnh")');

    // Roommate B sees the room and the food item
    await expect(pageB.locator(`text=${roomName}`).first()).toBeVisible({ timeout: 15000 });
    const foodCardB = pageB.locator('.glass-card', { hasText: foodName });
    await expect(foodCardB).toBeVisible({ timeout: 10000 });

    // Cleanup: Roommate B deletes the food item
    await foodCardB.locator('button[aria-label*="Xóa"]').click();
    const confirmModalB = pageB.locator('[role="dialog"]');
    await expect(confirmModalB).toBeVisible();
    await confirmModalB.locator('button:has-text("Xóa món")').click();
    await expect(confirmModalB).not.toBeVisible({ timeout: 5000 });
    await expect(pageB.locator('.glass-card', { hasText: foodName })).not.toBeVisible({ timeout: 10000 });

    await contextA.close();
    await contextB.close();
  });

  test('Auth rejection: wrong passcode displays error and denies access', async ({ page }) => {
    const roomName = `Khóa ${randomCode()}`;
    const passcode = randomPass();

    // 1. Create a room first to get a valid room code
    await page.goto('/');
    const toggle = page.locator('button:has-text("Tạo phòng mới cho 2 người")');
    if (await toggle.isVisible()) {
      await toggle.click();
    }
    await page.fill('input[placeholder*="Tên phòng"]', roomName);
    await page.fill('input[placeholder*="Mật khẩu bảo vệ"]', passcode);
    await page.fill('input[placeholder*="Tên của bạn"]', 'Owner');
    await page.click('button[type="submit"]:has-text("Tạo phòng mới")');

    await expect(page.locator(`text=${roomName}`).first()).toBeVisible({ timeout: 15000 });
    const codeText = await page.locator('header button:has-text("#")').innerText();
    const roomCode = codeText.match(/#(\d{6})/)[1];

    // 2. Clear session to return to login screen
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');

    // 3. Attempt join with incorrect passcode
    const joinToggle = page.locator('button:has-text("Đã có mã? Vào phòng")');
    if (await joinToggle.isVisible()) {
      await joinToggle.click();
    }
    await page.fill('input[placeholder*="Mã PIN 6 số"]', roomCode);
    await page.fill('input[placeholder*="Mật khẩu phòng"]', '000000'); // Wrong passcode
    await page.fill('input[placeholder*="Tên của bạn"]', 'Attacker');
    await page.click('button[type="submit"]:has-text("Vào tủ lạnh")');

    // Verify error banner is displayed
    const errorBanner = page.locator('.bg-danger-500\\/10');
    await expect(errorBanner).toBeVisible({ timeout: 10000 });
    // Verify NOT admitted into room
    await expect(page.locator('header button:has-text("#")')).not.toBeVisible();
  });

  test('Session persistence: reload preserves authenticated room session and data', async ({ page }) => {
    const roomName = `Bền vững ${randomCode()}`;
    const passcode = randomPass();
    const foodName = `Táo ${randomCode()}`;

    await page.goto('/');
    const toggle = page.locator('button:has-text("Tạo phòng mới cho 2 người")');
    if (await toggle.isVisible()) {
      await toggle.click();
    }
    await page.fill('input[placeholder*="Tên phòng"]', roomName);
    await page.fill('input[placeholder*="Mật khẩu bảo vệ"]', passcode);
    await page.fill('input[placeholder*="Tên của bạn"]', 'Tester');
    await page.click('button[type="submit"]:has-text("Tạo phòng mới")');

    await expect(page.locator(`text=${roomName}`).first()).toBeVisible({ timeout: 15000 });

    // Add food item
    await page.click('button[aria-label="Thêm món mới"]');
    await expect(page.locator('#quick-add-title')).toBeVisible();
    await page.fill('input[placeholder*="Tên thực phẩm"]', foodName);
    await page.click('button[type="submit"]:has-text("Lưu vào tủ")');
    const foodCard = page.locator('.glass-card', { hasText: foodName });
    await expect(foodCard).toBeVisible({ timeout: 10000 });

    // Hard reload page
    await page.reload();

    // Verify session was restored without asking for login
    await expect(page.locator(`text=${roomName}`).first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.glass-card', { hasText: foodName })).toBeVisible({ timeout: 10000 });

    // Cleanup food
    await page.locator('.glass-card', { hasText: foodName }).locator('button[aria-label*="Xóa"]').click();
    const confirmModal = page.locator('[role="dialog"]');
    await expect(confirmModal).toBeVisible();
    await confirmModal.locator('button:has-text("Xóa món")').click();
    await expect(confirmModal).not.toBeVisible({ timeout: 5000 });
    await expect(page.locator('.glass-card', { hasText: foodName })).not.toBeVisible({ timeout: 10000 });
  });

});
