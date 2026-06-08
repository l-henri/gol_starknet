#[cfg(test)]
mod tests {
    use gol_starknet::base64;
    use gol_starknet::gol_metadata;
    use gol_starknet::interfaces::LifeFormData;

    #[test]
    fn test_base64_known_vectors() {
        assert(base64::encode("") == "", 'empty');
        assert(base64::encode("f") == "Zg==", 'f');
        assert(base64::encode("fo") == "Zm8=", 'fo');
        assert(base64::encode("foo") == "Zm9v", 'foo');
        assert(base64::encode("foob") == "Zm9vYg==", 'foob');
        assert(base64::encode("fooba") == "Zm9vYmE=", 'fooba');
        assert(base64::encode("foobar") == "Zm9vYmFy", 'foobar');
        assert(base64::encode("Man") == "TWFu", 'Man');
    }

    #[test]
    fn test_decimal_conversion() {
        assert(gol_metadata::u32_to_decimal(0) == "0", 'u32 0');
        assert(gol_metadata::u32_to_decimal(150) == "150", 'u32 150');
        assert(gol_metadata::u256_to_decimal(0) == "0", 'u256 0');
        assert(gol_metadata::u256_to_decimal(1073856514) == "1073856514", 'u256 big');
    }

    #[test]
    fn test_render_svg_empty() {
        assert(
            gol_metadata::render_svg(0) == "<svg xmlns='http://www.w3.org/2000/svg' width='150' height='150' shape-rendering='crispEdges'><rect width='150' height='150' fill='#fff'/></svg>",
            'empty svg',
        );
    }

    #[test]
    fn test_render_svg_single_cell() {
        // bit 0 set => cell (row 0, col 0) at x=0,y=0
        assert(
            gol_metadata::render_svg(1) == "<svg xmlns='http://www.w3.org/2000/svg' width='150' height='150' shape-rendering='crispEdges'><rect width='150' height='150' fill='#fff'/><rect x='0' y='0' width='10' height='10'/></svg>",
            'single cell svg',
        );
    }

    #[test]
    fn test_metadata_json_structure() {
        let data = LifeFormData {
            is_loop: true,
            is_still: false,
            is_alive: true,
            is_dead: false,
            sequence_length: 2,
            current_state: 5,
            age: 7,
        };
        let json = gol_metadata::build_metadata_json(42, data, "IMG");
        assert(
            json == "{\"name\":\"Lifeform #42\",\"description\":\"An autonomous Conway's Game of Life lifeform living forever on Starknet.\",\"image\":\"IMG\",\"attributes\":[{\"trait_type\":\"Status\",\"value\":\"Alive\"},{\"trait_type\":\"Kind\",\"value\":\"Loop\"},{\"trait_type\":\"Sequence Length\",\"value\":2},{\"trait_type\":\"Age\",\"value\":7}]}",
            'json',
        );
    }

    #[test]
    fn test_token_uri_is_base64_json_data_uri() {
        let data = LifeFormData {
            is_loop: true,
            is_still: false,
            is_alive: true,
            is_dead: false,
            sequence_length: 1,
            current_state: 1,
            age: 0,
        };
        let uri = gol_metadata::token_uri(7, data);
        let prefix: ByteArray = "data:application/json;base64,";
        assert(uri.len() > prefix.len(), 'uri length');
        let mut i = 0;
        let mut matches = true;
        loop {
            if i >= prefix.len() {
                break;
            }
            if uri.at(i).unwrap() != prefix.at(i).unwrap() {
                matches = false;
                break;
            }
            i += 1;
        };
        assert(matches, 'uri prefix');
    }
}
