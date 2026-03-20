<?php
/**
 * Plugin Name: Gercep WCFM Sync
 * Description: Automatically syncs WCFM Vendor products to Gercep Platform via AI-ready API.
 * Version: 1.0.0
 * Author: Gercep Platform
 */

if (!defined('ABSPATH')) exit;

/**
 * Debug helper
 */
function gercep_log($message) {
    if (defined('WP_DEBUG') && WP_DEBUG) {
        error_log('Gercep AI: ' . $message);
    }
}

// 1. Add Gercep AI Menu to WCFM Sidebar
add_filter('wcfm_menus', 'gercep_wcfm_menus', 999);
add_filter('wcfm_vendor_menus', 'gercep_wcfm_menus', 999);

function gercep_wcfm_menus($menus) {
    // Try to get the robust WCFM endpoint URL
    $link = admin_url('admin.php?page=wcfm-settings'); // Fallback
    if (function_exists('get_wcfm_url')) {
        $link = get_wcfm_url() . 'settings/';
    }

    $menus['gercep_ai_sync'] = [
        'label'    => 'Gercep AI',
        'link'     => $link, 
        'icon'     => 'rocket',
        'priority' => 1
    ];
    return $menus;
}

// 2. Add Gercep Settings to WCFM Vendor Dashboard (Directly in General Settings for maximum visibility)
add_filter('wcfm_marketplace_settings_fields_general', function($settings_fields, $vendor_id) {
    $gercep_api_key = get_user_meta($vendor_id, 'gercep_api_key', true);
    
    // Add a divider/heading
    $settings_fields['gercep_ai_header'] = [
        'label'       => __('Gercep AI Configuration', 'wc-frontend-manager'),
        'type'        => 'html',
        'value'       => '<h2 style="margin-top:20px; border-bottom:1px solid #eee; padding-bottom:10px;">Gercep AI Assistant</h2>',
        'class'       => 'wcfm-text wcfm_ele',
        'label_class' => 'wcfm_title'
    ];

    $settings_fields['gercep_api_key'] = [
        'label'       => __('Gercep API Key', 'wc-frontend-manager'),
        'type'        => 'text',
        'class'       => 'wcfm-text wcfm_ele',
        'label_class' => 'wcfm_title',
        'value'       => $gercep_api_key,
        'placeholder' => 'Enter your Sovereign API Key',
        'desc'        => __('Get your API key from Gercep Dashboard > Integrations.', 'wc-frontend-manager')
    ];

    if (!empty($gercep_api_key)) {
        $settings_fields['gercep_bulk_sync'] = [
            'label'       => __('Bulk Sync Products', 'wc-frontend-manager'),
            'type'        => 'html',
            'value'       => '
                <div style="margin-top:10px;">
                    <button type="button" id="gercep_sync_btn" class="wcfm_submit_button" style="background:#2271b1; border:none; color:#fff; padding:10px 20px; border-radius:4px; cursor:pointer;">
                        Sync All Products to Gercep
                    </button>
                    <div id="gercep_sync_status" style="margin-top:10px; font-size:12px; color:#666;"></div>
                    <div id="gercep_sync_progress" style="display:none; width:100%; background:#eee; height:10px; border-radius:5px; margin-top:10px; overflow:hidden;">
                        <div id="gercep_sync_bar" style="width:0%; background:#2271b1; height:100%; transition:width 0.3s;"></div>
                    </div>
                </div>
                <script>
                jQuery(document).ready(function($) {
                    $("#gercep_sync_btn").on("click", function() {
                        if (!confirm("This will sync all your products to Gercep. Continue?")) return;
                        
                        const btn = $(this);
                        const status = $("#gercep_sync_status");
                        const progress = $("#gercep_sync_progress");
                        const bar = $("#gercep_sync_bar");
                        
                        btn.prop("disabled", true).css("opacity", 0.5).text("Syncing...");
                        progress.show();
                        status.text("Initializing sync...");
                        
                        function syncBatch(offset = 0) {
                            $.ajax({
                                url: wcfm_params.ajax_url,
                                type: "POST",
                                data: {
                                    action: "gercep_bulk_sync",
                                    offset: offset,
                                    nonce: "' . wp_create_nonce('gercep_sync_nonce') . '"
                                },
                                success: function(response) {
                                    if (response.success) {
                                        const data = response.data;
                                        const percent = Math.round((data.processed / data.total) * 100);
                                        bar.css("width", percent + "%");
                                        status.text("Processed " + data.processed + " of " + data.total + " products...");
                                        
                                        if (data.next_offset !== null) {
                                            syncBatch(data.next_offset);
                                        } else {
                                            status.text("Sync completed successfully! " + data.total + " products processed.");
                                            btn.prop("disabled", false).css("opacity", 1).text("Sync All Products to Gercep");
                                            setTimeout(() => progress.fadeOut(), 3000);
                                        }
                                    } else {
                                        status.text("Error: " + (response.data || "Unknown error"));
                                        btn.prop("disabled", false).css("opacity", 1).text("Retry Sync");
                                    }
                                },
                                error: function() {
                                    status.text("Network error occurred. Please try again.");
                                    btn.prop("disabled", false).css("opacity", 1).text("Retry Sync");
                                }
                            });
                        }
                        
                        syncBatch(0);
                    });
                });
                </script>
            ',
            'class'       => 'wcfm-text wcfm_ele',
            'label_class' => 'wcfm_title'
        ];
    }
    
    return $settings_fields;
}, 50, 2);

// 3. Remove the dedicated tab as it might be blocked by theme/WCFM config
// (Cleaned up redundant code)

// 4. Save Gercep Settings
add_action('wcfm_vendor_settings_update', function($vendor_id, $wcfm_settings_form) {
    if (isset($wcfm_settings_form['gercep_api_key'])) {
        update_user_meta($vendor_id, 'gercep_api_key', sanitize_text_field($wcfm_settings_form['gercep_api_key']));
    }
}, 10, 2);

// 4.1 AJAX Bulk Sync Handler
add_action('wp_ajax_gercep_bulk_sync', function() {
    if (!isset($_POST['nonce']) || !wp_verify_nonce($_POST['nonce'], 'gercep_sync_nonce')) {
        wp_send_json_error('Security check failed');
    }

    $vendor_id = function_exists('wcfm_get_vendor_id_by_post') ? apply_filters('wcfm_current_vendor_id', get_current_user_id()) : 0;
    if (!$vendor_id) {
        wp_send_json_error('Unauthorized');
    }

    $api_key = get_user_meta($vendor_id, 'gercep_api_key', true);
    if (empty($api_key)) {
        wp_send_json_error('API Key missing');
    }

    $offset = isset($_POST['offset']) ? intval($_POST['offset']) : 0;
    $batch_size = 50;

    $args = [
        'post_type'      => 'product',
        'post_status'    => 'publish',
        'posts_per_page' => $batch_size,
        'offset'         => $offset,
        'author'         => $vendor_id, // WCFM vendors are authors of their products
    ];

    $query = new WP_Query($args);
    $products = $query->posts;
    $total = $query->found_posts;

    if (empty($products)) {
        wp_send_json_success([
            'total'       => $total,
            'processed'   => $total,
            'next_offset' => null
        ]);
    }

    $sync_payload = [];
    foreach ($products as $post) {
        $product = wc_get_product($post->ID);
        if (!$product) continue;

        $categories = wp_get_post_terms($post->ID, 'product_cat', ['fields' => 'names']);
        $category = !empty($categories) ? end($categories) : 'General';

        $sync_payload[] = [
            'externalId'  => (string)$post->ID,
            'name'        => $product->get_name(),
            'price'       => (float)$product->get_price(),
            'category'    => $category,
            'description' => wp_strip_all_tags($product->get_short_description() ?: $product->get_description()),
            'stock'       => $product->get_stock_quantity() !== null ? (int)$product->get_stock_quantity() : 999999,
            'image'       => wp_get_attachment_url($product->get_image_id()) ?: null
        ];
    }

    if (!empty($sync_payload)) {
        $res = gercep_sync_to_api($api_key, [
            'action'   => 'upsert',
            'products' => $sync_payload
        ]);

        if (!$res) {
            wp_send_json_error('Failed to sync batch to Gercep API');
        }
    }

    $processed = $offset + count($products);
    $next_offset = ($processed < $total) ? $processed : null;

    wp_send_json_success([
        'total'       => $total,
        'processed'   => $processed,
        'next_offset' => $next_offset
    ]);
});

/**
 * Helper to send data to Gercep
 */
function gercep_sync_to_api($api_key, $payload) {
    $url = 'https://gercep.click/api/partner/sync-products';
    
    $response = wp_remote_post($url, [
        'headers' => [
            'Content-Type' => 'application/json',
            'x-api-key'    => $api_key
        ],
        'body'    => json_encode($payload),
        'timeout' => 60,
    ]);

    if (is_wp_error($response)) {
        error_log('Gercep Sync Error (WP Error): ' . $response->get_error_message());
        return false;
    }

    $code = wp_remote_retrieve_response_code($response);
    $body = wp_remote_retrieve_body($response);

    if ($code < 200 || $code >= 300) {
        error_log("Gercep Sync Error (HTTP $code): " . $body);
        return false;
    }

    gercep_log("Successfully synced " . count($payload['products']) . " products to Gercep. Response: " . $body);
    return true;
}

// 5. Hook: Sync on Product Save/Update
add_action('wcfm_after_product_save', 'gercep_wcfm_sync_product', 10, 2);
add_action('woocommerce_product_set_stock', 'gercep_wcfm_sync_stock_only');
add_action('woocommerce_variation_set_stock', 'gercep_wcfm_sync_stock_only');

function gercep_wcfm_sync_stock_only($product) {
    if (is_numeric($product)) {
        $product = wc_get_product($product);
    }
    if ($product) {
        gercep_wcfm_sync_product($product->get_id(), []);
    }
}

function gercep_wcfm_sync_product($product_id, $wcfm_data) {
    $vendor_id = wcfm_get_vendor_id_by_post($product_id);
    if (!$vendor_id) return;

    $api_key = get_user_meta($vendor_id, 'gercep_api_key', true);
    if (empty($api_key)) return;

    $product = wc_get_product($product_id);
    if (!$product) return;

    // Get Flattened Category
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

// 6. WP-Cron: Hourly Safety Sync
if (!wp_next_scheduled('gercep_hourly_sync_event')) {
    wp_schedule_event(time(), 'hourly', 'gercep_hourly_sync_event');
}

add_action('gercep_hourly_sync_event', 'gercep_run_hourly_sync');

function gercep_run_hourly_sync() {
    // Get all vendors who have a Gercep API Key
    global $wpdb;
    $vendors = $wpdb->get_results("SELECT user_id, meta_value as api_key FROM {$wpdb->usermeta} WHERE meta_key = 'gercep_api_key' AND meta_value != ''");

    foreach ($vendors as $vendor) {
        $vendor_id = $vendor->user_id;
        $api_key = $vendor->api_key;

        $args = [
            'post_type'      => 'product',
            'post_status'    => 'publish',
            'posts_per_page' => -1,
            'author'         => $vendor_id,
        ];

        $query = new WP_Query($args);
        $products = $query->posts;

        if (empty($products)) continue;

        $sync_payload = [];
        foreach ($products as $post) {
            $product = wc_get_product($post->ID);
            if (!$product) continue;

            $categories = wp_get_post_terms($post->ID, 'product_cat', ['fields' => 'names']);
            $category = !empty($categories) ? end($categories) : 'General';

            $sync_payload[] = [
                'externalId'  => (string)$post->ID,
                'name'        => $product->get_name(),
                'price'       => (float)$product->get_price(),
                'category'    => $category,
                'description' => wp_strip_all_tags($product->get_short_description() ?: $product->get_description()),
                'stock'       => $product->get_stock_quantity() !== null ? (int)$product->get_stock_quantity() : 999999,
                'image'       => wp_get_attachment_url($product->get_image_id()) ?: null
            ];

            // Sync in batches of 50 to avoid payload limits
            if (count($sync_payload) >= 50) {
                gercep_sync_to_api($api_key, ['action' => 'upsert', 'products' => $sync_payload]);
                $sync_payload = [];
            }
        }

        if (!empty($sync_payload)) {
            gercep_sync_to_api($api_key, ['action' => 'upsert', 'products' => $sync_payload]);
        }
    }
}

// 7. Hook: Sync on Product Delete
add_action('before_delete_post', function($post_id) {
    if (get_post_type($post_id) !== 'product') return;

    $vendor_id = wcfm_get_vendor_id_by_post($post_id);
    if (!$vendor_id) return;

    $api_key = get_user_meta($vendor_id, 'gercep_api_key', true);
    if (empty($api_key)) return;

    $payload = [
        'action'   => 'delete',
        'products' => [[
            'externalId' => (string)$post_id
        ]]
    ];

    gercep_sync_to_api($api_key, $payload);
}, 10);

// 8. Register REST API for Reverse Sync (Gercep -> WordPress)
add_action('rest_api_init', function () {
    register_rest_route('gercep/v1', '/sync-back', [
        'methods'             => 'POST',
        'callback'            => 'gercep_handle_reverse_sync',
        'permission_callback' => '__return_true',
    ]);
});

function gercep_handle_reverse_sync($request) {
    $params = $request->get_json_params();
    $action = $params['action'] ?? 'upsert';
    $external_id = $params['externalId'] ?? '';
    $name = $params['name'] ?? '';
    $price = $params['price'] ?? null;
    $stock = $params['stock'] ?? null;
    $category = $params['category'] ?? 'General';
    $description = $params['description'] ?? '';
    $image_url = $params['image'] ?? null;
    $api_key = $request->get_header('x-api-key');

    // Verify vendor by API Key for security
    global $wpdb;
    $vendor_id = $wpdb->get_var($wpdb->prepare("SELECT user_id FROM {$wpdb->usermeta} WHERE meta_key = 'gercep_api_key' AND meta_value = %s", $api_key));

    if (!$vendor_id) return new WP_Error('unauthorized', 'Invalid API Key', ['status' => 401]);

    // Handle Deletion
    if ($action === 'delete') {
        if (empty($external_id)) return new WP_Error('no_id', 'Product ID missing', ['status' => 400]);
        wp_delete_post($external_id, true);
        return ['success' => true, 'message' => 'Product deleted from WordPress'];
    }

    // Handle Creation
    if ($action === 'create' || (empty($external_id) && $action === 'upsert')) {
        $post_id = wp_insert_post([
            'post_title'   => $name,
            'post_content' => $description,
            'post_status'  => 'publish',
            'post_type'    => 'product',
            'post_author'  => $vendor_id
        ]);

        if (is_wp_error($post_id)) return $post_id;

        $product = wc_get_product($post_id);
        if ($price !== null) $product->set_regular_price($price);
        if ($stock !== null) {
            $product->set_manage_stock(true);
            $product->set_stock_quantity($stock);
        }
        
        // Set category
        if (!empty($category)) {
            wp_set_object_terms($post_id, $category, 'product_cat');
        }

        // Handle Image
        if (!empty($image_url)) {
            $image_id = gercep_upload_image_from_url($image_url, $post_id);
            if ($image_id) $product->set_image_id($image_id);
        }

        $product->save();
        
        // Return the new ID so Gercep can save it as externalId
        return ['success' => true, 'message' => 'Product created in WordPress', 'externalId' => (string)$post_id];
    }

    // Handle Upsert (Update)
    if (empty($external_id)) return new WP_Error('no_id', 'Product ID missing', ['status' => 400]);

    $product = wc_get_product($external_id);
    if (!$product) return new WP_Error('not_found', 'Product not found in WordPress', ['status' => 404]);

    if (!empty($name)) $product->set_name($name);
    if ($price !== null) $product->set_regular_price($price);
    if ($stock !== null) {
        $product->set_manage_stock(true);
        $product->set_stock_quantity($stock);
    }
    if (!empty($description)) {
        wp_update_post(['ID' => $external_id, 'post_content' => $description]);
    }

    $product->save();

    return ['success' => true, 'message' => 'Product updated from Gercep'];
}

/**
 * Helper to upload image from URL to WordPress media library
 */
function gercep_upload_image_from_url($url, $post_id) {
    require_once(ABSPATH . 'wp-admin/includes/media.php');
    require_once(ABSPATH . 'wp-admin/includes/file.php');
    require_once(ABSPATH . 'wp-admin/includes/image.php');

    $tmp = download_url($url);
    if (is_wp_error($tmp)) return false;

    $file_array = [
        'name'     => basename($url),
        'tmp_name' => $tmp
    ];

    $id = media_handle_sideload($file_array, $post_id);
    
    if (is_wp_error($id)) {
        @unlink($file_array['tmp_name']);
        return false;
    }

    return $id;
}
