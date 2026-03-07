<?php
/**
 * Plugin Name: LCP Currency Switcher (USD/IDR)
 * Plugin URI: https://autoparts.mythoz.com/
 * Description: Automatically switches currency between USD and IDR based on user's IP address. Version 2.3.0 with ultra-aggressive price and range conversion.
 * Version: 2.3.0
 * Author: LCP Auto Cars
 * Author URI: https://autoparts.mythoz.com/
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit; // Exit if accessed directly.
}

class LCP_Currency_Switcher {

    private $exchange_rate;
    private $user_country = '';
    private $user_ip = '';

    public function __construct() {
        // Run detection on init
        add_action( 'init', array( $this, 'init_plugin' ) );

        // Admin menu
        add_action( 'admin_menu', array( $this, 'add_admin_menu' ) );
        add_action( 'admin_init', array( $this, 'register_settings' ) );

        // 1. Basic Currency Setup
        add_filter( 'woocommerce_currency', array( $this, 'set_currency' ), 999 );
        add_filter( 'woocommerce_currency_symbol', array( $this, 'set_currency_symbol' ), 999, 2 );

        // 2. Global Raw Price Conversion
        $price_hooks = array(
            'woocommerce_product_get_price',
            'woocommerce_product_get_regular_price',
            'woocommerce_product_get_sale_price',
            'woocommerce_product_variation_get_price',
            'woocommerce_product_variation_get_regular_price',
            'woocommerce_product_variation_get_sale_price',
            'woocommerce_get_variation_regular_price',
            'woocommerce_get_variation_sale_price',
            'woocommerce_get_variation_price',
        );
        foreach ( $price_hooks as $hook ) {
            add_filter( $hook, array( $this, 'convert_raw_price' ), 999, 2 );
        }

        // 3. ULTRA-AGGRESSIVE VARIATION FIX: Use the highest possible priority (999)
        add_filter( 'woocommerce_variation_prices', array( $this, 'convert_variation_prices_array' ), 999, 3 );
        add_filter( 'woocommerce_get_variation_prices_hash', array( $this, 'add_currency_to_variation_hash' ), 999, 1 );

        // 4. Fix the JSON data for variation dropdowns
        add_filter( 'woocommerce_available_variation', array( $this, 'fix_json_variation_data' ), 999, 3 );

        // 5. Final HTML Protection for range price
        add_filter( 'woocommerce_get_price_html', array( $this, 'force_rebuild_range_html' ), 999, 2 );
        add_filter( 'woocommerce_variable_price_html', array( $this, 'force_rebuild_range_html' ), 999, 2 );

        // Frontend CSS/JS Fix
        add_action( 'wp_head', array( $this, 'add_frontend_protection' ) );
        
        // Shipping
        add_filter( 'woocommerce_package_rates', array( $this, 'convert_shipping' ), 999, 2 );
    }

    public function init_plugin() {
        $this->exchange_rate = $this->get_current_exchange_rate();
        $this->user_ip = $this->get_user_ip();
        $this->detect_user_country();

        if ( isset( $_GET['lcp_reset'] ) ) {
            $this->clear_woocommerce_cache();
        }
    }

    private function get_current_exchange_rate() {
        return (float) get_option( 'lcp_exchange_rate', 15000 );
    }

    /**
     * Aggressively converts the variation prices array to ensure the range display is correct.
     */
    public function convert_variation_prices_array( $prices_array, $product, $for_display ) {
        if ( is_admin() && ! defined( 'DOING_AJAX' ) ) return $prices_array;

        foreach ( $prices_array as $key => $values ) {
            foreach ( $values as $vid => $price ) {
                $prices_array[$key][$vid] = $this->convert_raw_price( $price );
            }
        }
        return $prices_array;
    }

    /**
     * Rebuilds the range HTML from scratch using raw prices.
     */
    public function force_rebuild_range_html( $html, $product ) {
        if ( is_admin() && ! defined( 'DOING_AJAX' ) ) return $html;
        if ( ! is_object( $product ) ) return $html;

        if ( $product->is_type( 'variable' ) ) {
            $prices = $product->get_variation_prices( true );
            if ( empty( $prices['price'] ) ) return $html;

            $min_price = $this->convert_raw_price( current( $prices['price'] ) );
            $max_price = $this->convert_raw_price( end( $prices['price'] ) );

            if ( $min_price !== $max_price ) {
                $html = wc_format_price_range( $min_price, $max_price );
            } else {
                $html = wc_price( $min_price );
            }
            return $html;
        }
        return $html;
    }

    public function add_frontend_protection() {
        if ( is_admin() ) return;
        ?>
        <script>
            document.addEventListener('DOMContentLoaded', function() {
                function fixPrices() {
                    const country = '<?php echo $this->user_country; ?>';
                    const priceElements = document.querySelectorAll('.price, .woocommerce-Price-amount bdi');
                    priceElements.forEach(el => {
                        const text = el.innerText;
                        // If outside ID but still shows millions
                        if (country !== 'ID' && text.includes('$') && (text.match(/\./g) || []).length >= 2) {
                            el.style.display = 'none';
                        }
                    });
                }
                fixPrices();
                setTimeout(fixPrices, 1500);
            });
        </script>
        <?php
    }

    public function convert_raw_price( $price, $product = null ) {
        if ( is_admin() && ! defined( 'DOING_AJAX' ) ) return $price;
        if ( empty( $price ) || ! is_numeric( $price ) ) return $price;
        
        $price = (float) $price;

        if ( $this->user_country === 'ID' ) {
            // Indonesia: Multiply if it's small USD
            return ( $price < 100000 ) ? $price * $this->exchange_rate : $price;
        } else {
            // Outside: Divide if it's large IDR
            return ( $price > 100000 ) ? $price / $this->exchange_rate : $price;
        }
    }

    public function fix_json_variation_data( $data, $product, $variation ) {
        if ( is_admin() && ! defined( 'DOING_AJAX' ) ) return $data;
        $data['display_price'] = $this->convert_raw_price( $data['display_price'] );
        $data['display_regular_price'] = $this->convert_raw_price( $data['display_regular_price'] );
        return $data;
    }

    public function add_currency_to_variation_hash( $hash ) {
        $hash[] = $this->user_country;
        return $hash;
    }

    public function detect_user_country() {
        if ( is_admin() && ! defined( 'DOING_AJAX' ) && ! isset($_GET['page']) ) {
            $this->user_country = 'US';
            return;
        }
        
        if ( isset( $_GET['lcp_reset'] ) ) {
            setcookie( 'lcp_user_country_data', '', time() - 3600, "/" );
            unset( $_COOKIE['lcp_user_country_data'] );
        }

        if ( isset( $_GET['lcp_debug_country'] ) ) {
            $this->user_country = strtoupper(sanitize_text_field( $_GET['lcp_debug_country'] ));
            return;
        }

        if ( isset( $_COOKIE['lcp_user_country_data'] ) ) {
            $cookie_data = json_decode( stripslashes( $_COOKIE['lcp_user_country_data'] ), true );
            if ( isset( $cookie_data['ip'] ) && $cookie_data['ip'] === $this->user_ip ) {
                $this->user_country = $cookie_data['country'];
                return;
            }
        }

        $response = wp_remote_get( "http://ip-api.com/json/{$this->user_ip}" );
        if ( ! is_wp_error( $response ) ) {
            $data = json_decode( wp_remote_retrieve_body( $response ), true );
            if ( isset( $data['countryCode'] ) ) $this->user_country = $data['countryCode'];
        }

        if ( empty( $this->user_country ) ) $this->user_country = 'US';
    }

    private function get_user_ip() {
        $ip = '0.0.0.0';
        if ( ! empty( $_SERVER['HTTP_CLIENT_IP'] ) ) $ip = $_SERVER['HTTP_CLIENT_IP'];
        elseif ( ! empty( $_SERVER['HTTP_X_FORWARDED_FOR'] ) ) {
            $ips = explode( ',', $_SERVER['HTTP_X_FORWARDED_FOR'] );
            $ip = trim( $ips[0] );
        } else $ip = $_SERVER['REMOTE_ADDR'];
        
        if ($ip === '::1' || $ip === '127.0.0.1') return '180.242.71.14';
        return $ip;
    }

    public function set_currency( $currency ) {
        if ( is_admin() ) return $currency;
        return ( $this->user_country === 'ID' ) ? 'IDR' : 'USD';
    }

    public function set_currency_symbol( $symbol, $currency ) {
        if ( is_admin() ) return $symbol;
        return ( $currency === 'IDR' ) ? 'Rp. ' : $symbol;
    }

    public function convert_shipping( $rates, $package ) {
        if ( is_admin() ) return $rates;
        if ( $this->user_country === 'ID' ) {
            foreach ( $rates as $rate_key => $rate ) {
                $rates[$rate_key]->cost *= $this->exchange_rate;
            }
        }
        return $rates;
    }

    private function clear_woocommerce_cache() {
        global $wpdb;
        $wpdb->query( "DELETE FROM $wpdb->options WHERE option_name LIKE '_transient_wc_var_prices_%'" );
        wc_delete_product_transients();
    }

    public function add_admin_menu() {
        add_options_page( 'LCP Currency Settings', 'LCP Currency', 'manage_options', 'lcp-currency-switcher', array( $this, 'settings_page' ) );
    }

    public function register_settings() {
        register_setting( 'lcp_currency_settings', 'lcp_exchange_rate' );
        register_setting( 'lcp_currency_settings', 'lcp_rate_mode' );
    }

    public function settings_page() {
        ?>
        <div class="wrap">
            <h1>LCP Currency Switcher Settings</h1>
            <form method="post" action="options.php">
                <?php settings_fields( 'lcp_currency_settings' ); ?>
                <table class="form-table">
                    <tr valign="top">
                        <th scope="row">Manual Exchange Rate (1 USD to IDR)</th>
                        <td><input type="number" name="lcp_exchange_rate" value="<?php echo esc_attr( get_option( 'lcp_exchange_rate', 15000 ) ); ?>" /></td>
                    </tr>
                </table>
                <?php submit_button(); ?>
            </form>
            <hr>
            <h2>Status & Debug</h2>
            <p>Active Exchange Rate: <strong>1 USD = <?php echo number_format($this->exchange_rate, 2); ?> IDR</strong></p>
            <p>Your Current IP: <strong><?php echo $this->user_ip; ?></strong></p>
            <p>Detected Country Code: <strong><?php echo $this->user_country; ?></strong></p>
            <p style="margin-top: 20px;">
                <a href="<?php echo add_query_arg('lcp_reset', '1'); ?>" class="button">Force Re-detect & Clear All Cache</a>
            </p>
        </div>
        <?php
    }
}

new LCP_Currency_Switcher();
