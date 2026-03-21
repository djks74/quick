<?php
/**
 * Plugin Name: Gercep WooCommerce Sync
 * Description: Automatically syncs WooCommerce products to Gercep Platform via AI-ready API.
 * Version: 1.0.0
 * Author: Gercep Platform
 */

if (!defined('ABSPATH')) exit;

// 1. Add Settings Page
add_action('admin_menu', function() {
    add_options_page('Gercep Sync', 'Gercep Sync', 'manage_options', 'gercep-sync', 'gercep_settings_page');
});

function gercep_settings_page() {
    $api_key = get_option('gercep_api_key');
    ?>
    <div class="wrap">
        <h1>Gercep Sync Settings</h1>
        <form method="post" action="options.php">
            <?php settings_fields('gercep-settings-group'); ?>
            <table class="form-table">
                <tr>
                    <th>API Key</th>
                    <td><input type="text" name="gercep_api_key" value="<?php echo esc_attr($api_key); ?>" class="regular-text" /></td>
                </tr>
            </table>
            <?php submit_button(); ?>
        </form>
    </div>
    <?php
}

add_action('admin_init', function() {
    register_setting('gercep-settings-group', 'gercep_api_key');
});

// 2. Sync Logic (Same as WCFM but for standard WooCommerce)
function gercep_sync_to_api($api_key, $payload) {
    $url = 'https://gercep.click/api/partner/sync-products';
    wp_remote_post($url, [
        'headers' => ['Content-Type' => 'application/json', 'x-api-key' => $api_key],
        'body'    => json_encode($payload),
        'timeout' => 60,
    ]);
}

add_action('woocommerce_update_product', 'gercep_woo_sync_product', 10, 1);
function gercep_woo_sync_product($product_id) {
    $api_key = get_option('gercep_api_key');
    if (empty($api_key)) return;

    $product = wc_get_product($product_id);
    if (!$product) return;

    $categories = wp_get_post_terms($product_id, 'product_cat', ['fields' => 'names']);
    $category = !empty($categories) ? end($categories) : 'General';

    $payload = [
        'action'   => 'upsert',
        'products' => [[
            'externalId'  => (string)$product_id,
            'name'        => $product->get_name(),
            'price'       => (float)$product->get_price(),
            'category'    => $category,
            'description' => wp_strip_all_tags($product->get_short_description() ?: $product->get_description()),
            'stock'       => $product->get_stock_quantity() !== null ? (int)$product->get_stock_quantity() : 999999,
            'image'       => wp_get_attachment_url($product->get_image_id()) ?: null
        ]]
    ];
    gercep_sync_to_api($api_key, $payload);
}
