/// Minimal expression evaluator — no external dependencies.
///
/// Supports:
///   Arithmetic:  +  -  *  /   (correct precedence)
///   String:      "str" + field  (concatenation when either side is a string)
///   Functions:   upper, lower, len, trim, str, num, round(x, N)
///   Row Funcs:   if(cond, true_val, false_val) - lazy evaluated based on `cond`
///   Aggregates:  sum(col), avg(col), countif(cond)
///
/// Row functions (if, round, num) evaluate per-row dynamically.
/// Aggregate functions evaluate across the entire subset of `filtered_indices` and return a uniform, global value mapped across each row calculation.
/// Any evaluation error ⟹ ExprValue::Null (no panic).
use std::collections::HashMap;

// ── Public API ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
pub enum ExprValue {
    Num(f64),
    Str(String),
    Null,
}

impl ExprValue {
    pub fn to_display(&self) -> Option<String> {
        match self {
            ExprValue::Num(n) => {
                // Avoid trailing ".0" for whole numbers
                if n.fract() == 0.0 && n.abs() < 1e15 {
                    Some(format!("{}", *n as i64))
                } else {
                    Some(format!("{n}"))
                }
            }
            ExprValue::Str(s) => Some(s.clone()),
            ExprValue::Null => None,
        }
    }
}

/// Evaluate `expr` substituting column references from `record`.
/// When evaluating aggregate functions (sum/avg), `all_records` provides the subset context.
/// Returns `ExprValue::Null` on any error.
pub fn eval_expr(
    expr: &str, 
    record: &HashMap<String, String>,
    all_records: Option<&[HashMap<String, String>]>,
) -> ExprValue {
    let tokens = tokenize(expr);
    if tokens.is_empty() {
        return ExprValue::Null;
    }
    let mut pos = 0usize;
    match parse_expr(&tokens, &mut pos, 0, record, all_records) {
        Some(v) => v,
        None => ExprValue::Null,
    }
}

// ── Tokenizer ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
enum Token {
    Num(f64),
    Str(String),
    Ident(String),
    Plus,
    Minus,
    Star,
    Slash,
    Comma,
    LParen,
    RParen,
    Gt,
    Lt,
    GtEq,
    LtEq,
    EqEq,
    NotEq,
}

fn tokenize(input: &str) -> Vec<Token> {
    let chars: Vec<char> = input.chars().collect();
    let mut tokens = Vec::new();
    let mut i = 0;

    while i < chars.len() {
        match chars[i] {
            ' ' | '\t' | '\n' | '\r' => {
                i += 1;
            }
            '"' | '\'' => {
                let quote = chars[i];
                i += 1;
                let mut s = String::new();
                while i < chars.len() && chars[i] != quote {
                    if chars[i] == '\\' && i + 1 < chars.len() {
                        i += 1;
                        match chars[i] {
                            'n' => s.push('\n'),
                            't' => s.push('\t'),
                            c => s.push(c),
                        }
                    } else {
                        s.push(chars[i]);
                    }
                    i += 1;
                }
                i += 1; // closing quote
                tokens.push(Token::Str(s));
            }
            '+' => {
                tokens.push(Token::Plus);
                i += 1;
            }
            '-' => {
                // Look-ahead: if previous token was a number/ident/rparen, it's binary minus.
                // Otherwise it could be a unary minus — handle as unary by emitting Num(-1)*next,
                // but for simplicity emit Minus and let parse handle it as binary.
                tokens.push(Token::Minus);
                i += 1;
            }
            '*' => {
                tokens.push(Token::Star);
                i += 1;
            }
            '/' => {
                tokens.push(Token::Slash);
                i += 1;
            }
            ',' => {
                tokens.push(Token::Comma);
                i += 1;
            }
            '(' => {
                tokens.push(Token::LParen);
                i += 1;
            }
            ')' => {
                tokens.push(Token::RParen);
                i += 1;
            }
            '>' => {
                if i + 1 < chars.len() && chars[i + 1] == '=' {
                    tokens.push(Token::GtEq);
                    i += 2;
                } else {
                    tokens.push(Token::Gt);
                    i += 1;
                }
            }
            '<' => {
                if i + 1 < chars.len() && chars[i + 1] == '=' {
                    tokens.push(Token::LtEq);
                    i += 2;
                } else {
                    tokens.push(Token::Lt);
                    i += 1;
                }
            }
            '=' => {
                if i + 1 < chars.len() && chars[i + 1] == '=' {
                    tokens.push(Token::EqEq);
                    i += 2;
                } else {
                    // Not supporting single `=` as assignment, so just skip or ignore
                    i += 1;
                }
            }
            '!' => {
                if i + 1 < chars.len() && chars[i + 1] == '=' {
                    tokens.push(Token::NotEq);
                    i += 2;
                } else {
                    // Not supporting unary `!` for now
                    i += 1;
                }
            }
            c if c.is_ascii_digit() || c == '.' => {
                let start = i;
                while i < chars.len() && (chars[i].is_ascii_digit() || chars[i] == '.') {
                    i += 1;
                }
                let s: String = chars[start..i].iter().collect();
                if let Ok(n) = s.parse::<f64>() {
                    tokens.push(Token::Num(n));
                }
            }
            c if c.is_alphabetic() || c == '_' => {
                let start = i;
                while i < chars.len() && (chars[i].is_alphanumeric() || chars[i] == '_') {
                    i += 1;
                }
                let ident: String = chars[start..i].iter().collect();
                tokens.push(Token::Ident(ident));
            }
            _ => {
                i += 1;
            } // skip unknown
        }
    }
    tokens
}

// ── Pratt Parser ──────────────────────────────────────────────────────────────

fn precedence(tok: &Token) -> u8 {
    match tok {
        Token::EqEq | Token::NotEq => 1,
        Token::Gt | Token::Lt | Token::GtEq | Token::LtEq => 2,
        Token::Plus | Token::Minus => 3,
        Token::Star | Token::Slash => 4,
        _ => 0,
    }
}

/// Skips tokens marking nested scope brackets until a comma or final matching parenthesis
fn skip_argument(tokens: &[Token], pos: &mut usize) {
    let mut depth = 0;
    while *pos < tokens.len() {
        match tokens[*pos] {
            Token::LParen => depth += 1,
            Token::RParen => {
                if depth == 0 { break; }
                depth -= 1;
            }
            Token::Comma => {
                if depth == 0 { break; }
            }
            _ => {}
        }
        *pos += 1;
    }
}

/// Parse an expression starting at `*pos` with minimum precedence `min_prec`.
/// Returns `None` on any error (propagates as Null to caller).
fn parse_expr(
    tokens: &[Token],
    pos: &mut usize,
    min_prec: u8,
    record: &HashMap<String, String>,
    all_records: Option<&[HashMap<String, String>]>,
) -> Option<ExprValue> {
    let mut lhs = parse_primary(tokens, pos, record, all_records)?;

    loop {
        let op = match tokens.get(*pos) {
            Some(t) if precedence(t) > min_prec => t.clone(),
            _ => break,
        };
        let prec = precedence(&op);
        *pos += 1;
        let rhs = parse_expr(tokens, pos, prec, record, all_records)?;
        lhs = apply_binop(&op, lhs, rhs)?;
    }

    Some(lhs)
}

fn parse_primary(
    tokens: &[Token],
    pos: &mut usize,
    record: &HashMap<String, String>,
    all_records: Option<&[HashMap<String, String>]>,
) -> Option<ExprValue> {
    match tokens.get(*pos)?.clone() {
        Token::Num(n) => {
            *pos += 1;
            Some(ExprValue::Num(n))
        }
        Token::Str(s) => {
            *pos += 1;
            Some(ExprValue::Str(s))
        }
        Token::LParen => {
            *pos += 1;
            let val = parse_expr(tokens, pos, 0, record, all_records)?;
            if tokens.get(*pos) == Some(&Token::RParen) {
                *pos += 1;
            }
            Some(val)
        }
        Token::Minus => {
            // Unary minus
            *pos += 1;
            let val = parse_primary(tokens, pos, record, all_records)?;
            match val {
                ExprValue::Num(n) => Some(ExprValue::Num(-n)),
                _ => None,
            }
        }
        Token::Ident(name) => {
            *pos += 1;
            // Function call?
            if tokens.get(*pos) == Some(&Token::LParen) {
                *pos += 1; // consume '('
                
                let lower = name.to_lowercase();
                
                if lower == "if" {
                    let cond = parse_expr(tokens, pos, 0, record, all_records)?;
                    if tokens.get(*pos) != Some(&Token::Comma) { return None; }
                    *pos += 1;
                    
                    let is_true = match cond {
                        ExprValue::Num(n) => n != 0.0,
                        ExprValue::Str(_) => true,
                        ExprValue::Null => false,
                    };
                    
                    if is_true {
                        let true_val = parse_expr(tokens, pos, 0, record, all_records)?;
                        if tokens.get(*pos) != Some(&Token::Comma) { return None; }
                        *pos += 1;
                        skip_argument(tokens, pos);
                        if tokens.get(*pos) == Some(&Token::RParen) { *pos += 1; }
                        return Some(true_val);
                    } else {
                        skip_argument(tokens, pos);
                        if tokens.get(*pos) != Some(&Token::Comma) { return None; }
                        *pos += 1;
                        let false_val = parse_expr(tokens, pos, 0, record, all_records)?;
                        if tokens.get(*pos) == Some(&Token::RParen) { *pos += 1; }
                        return Some(false_val);
                    }
                }
                
                if matches!(lower.as_str(), "sum" | "avg" | "countif") {
                    let arg_start = *pos;
                    skip_argument(tokens, pos);
                    if tokens.get(*pos) == Some(&Token::RParen) { *pos += 1; } else { return None; }
                    
                    if let Some(records_slice) = all_records {
                        let mut sum_val = 0.0;
                        let mut count = 0;
                        for r in records_slice {
                            let mut local_pos = arg_start;
                            // Evaluate sequentially simulating local row access mapping subset globally
                            let val = parse_expr(tokens, &mut local_pos, 0, r, all_records)?;
                            if lower == "countif" {
                                let is_true = match val {
                                    ExprValue::Num(n) => n != 0.0,
                                    ExprValue::Str(_) => true,
                                    ExprValue::Null => false,
                                };
                                if is_true {
                                    count += 1;
                                }
                            } else {
                                if let ExprValue::Num(n) = val {
                                    sum_val += n;
                                    count += 1;
                                } else if let ExprValue::Str(s) = val {
                                    if let Ok(n) = s.parse::<f64>() {
                                        sum_val += n;
                                        count += 1;
                                    }
                                }
                            }
                        }
                        
                        match lower.as_str() {
                            "sum" => return Some(ExprValue::Num(sum_val)),
                            "avg" => {
                                if count > 0 { 
                                    return Some(ExprValue::Num(sum_val / count as f64));
                                } else { 
                                    return Some(ExprValue::Num(0.0));
                                }
                            }
                            "countif" => return Some(ExprValue::Num(count as f64)),
                            _ => unreachable!(),
                        }
                    } else {
                        return Some(ExprValue::Null); // Undefined bounds mapping context empty
                    }
                }

                let args = parse_args(tokens, pos, record, all_records)?;
                Some(call_function(&name, args))
            } else {
                // Column reference
                if let Some(val) = record.get(&name) {
                    // Try numeric first, fall back to string
                    if let Ok(n) = val.parse::<f64>() {
                        Some(ExprValue::Num(n))
                    } else {
                        Some(ExprValue::Str(val.clone()))
                    }
                } else {
                    // Unknown identifier: try as Null
                    Some(ExprValue::Null)
                }
            }
        }
        _ => None,
    }
}

fn parse_args(
    tokens: &[Token],
    pos: &mut usize,
    record: &HashMap<String, String>,
    all_records: Option<&[HashMap<String, String>]>,
) -> Option<Vec<ExprValue>> {
    let mut args = Vec::new();
    // Empty arg list
    if tokens.get(*pos) == Some(&Token::RParen) {
        *pos += 1;
        return Some(args);
    }
    loop {
        let val = parse_expr(tokens, pos, 0, record, all_records)?;
        args.push(val);
        match tokens.get(*pos) {
            Some(Token::Comma) => {
                *pos += 1;
            }
            Some(Token::RParen) => {
                *pos += 1;
                break;
            }
            _ => break,
        }
    }
    Some(args)
}

fn apply_binop(op: &Token, lhs: ExprValue, rhs: ExprValue) -> Option<ExprValue> {
    // If either side is Null, propagate
    if matches!(lhs, ExprValue::Null) || matches!(rhs, ExprValue::Null) {
        return Some(ExprValue::Null);
    }

    match op {
        Token::Plus => {
            // String concatenation if either side is a string
            match (&lhs, &rhs) {
                (ExprValue::Str(a), ExprValue::Str(b)) => Some(ExprValue::Str(format!("{a}{b}"))),
                (ExprValue::Str(a), ExprValue::Num(b)) => Some(ExprValue::Str(format!("{a}{b}"))),
                (ExprValue::Num(a), ExprValue::Str(b)) => Some(ExprValue::Str(format!("{a}{b}"))),
                (ExprValue::Num(a), ExprValue::Num(b)) => Some(ExprValue::Num(a + b)),
                _ => None,
            }
        }
        Token::Minus => match (&lhs, &rhs) {
            (ExprValue::Num(a), ExprValue::Num(b)) => Some(ExprValue::Num(a - b)),
            _ => None,
        },
        Token::Star => match (&lhs, &rhs) {
            (ExprValue::Num(a), ExprValue::Num(b)) => Some(ExprValue::Num(a * b)),
            _ => None,
        },
        Token::Slash => match (&lhs, &rhs) {
            (ExprValue::Num(a), ExprValue::Num(b)) => {
                if *b == 0.0 {
                    Some(ExprValue::Null) // division by zero → Null
                } else {
                    Some(ExprValue::Num(a / b))
                }
            }
            _ => None,
        },
        Token::Gt => match (&lhs, &rhs) {
            (ExprValue::Num(a), ExprValue::Num(b)) => Some(ExprValue::Num(if a > b { 1.0 } else { 0.0 })),
            (ExprValue::Str(a), ExprValue::Str(b)) => Some(ExprValue::Num(if a > b { 1.0 } else { 0.0 })),
            _ => None,
        },
        Token::Lt => match (&lhs, &rhs) {
            (ExprValue::Num(a), ExprValue::Num(b)) => Some(ExprValue::Num(if a < b { 1.0 } else { 0.0 })),
            (ExprValue::Str(a), ExprValue::Str(b)) => Some(ExprValue::Num(if a < b { 1.0 } else { 0.0 })),
            _ => None,
        },
        Token::GtEq => match (&lhs, &rhs) {
            (ExprValue::Num(a), ExprValue::Num(b)) => Some(ExprValue::Num(if a >= b { 1.0 } else { 0.0 })),
            (ExprValue::Str(a), ExprValue::Str(b)) => Some(ExprValue::Num(if a >= b { 1.0 } else { 0.0 })),
            _ => None,
        },
        Token::LtEq => match (&lhs, &rhs) {
            (ExprValue::Num(a), ExprValue::Num(b)) => Some(ExprValue::Num(if a <= b { 1.0 } else { 0.0 })),
            (ExprValue::Str(a), ExprValue::Str(b)) => Some(ExprValue::Num(if a <= b { 1.0 } else { 0.0 })),
            _ => None,
        },
        Token::EqEq => match (&lhs, &rhs) {
            (ExprValue::Num(a), ExprValue::Num(b)) => Some(ExprValue::Num(if a == b { 1.0 } else { 0.0 })),
            (ExprValue::Str(a), ExprValue::Str(b)) => Some(ExprValue::Num(if a == b { 1.0 } else { 0.0 })),
            _ => None,
        },
        Token::NotEq => match (&lhs, &rhs) {
            (ExprValue::Num(a), ExprValue::Num(b)) => Some(ExprValue::Num(if a != b { 1.0 } else { 0.0 })),
            (ExprValue::Str(a), ExprValue::Str(b)) => Some(ExprValue::Num(if a != b { 1.0 } else { 0.0 })),
            _ => None,
        },
        _ => None,
    }
}

fn call_function(name: &str, args: Vec<ExprValue>) -> ExprValue {
    let lower_name = name.to_lowercase();
    match lower_name.as_str() {
        "upper" => {
            let s = coerce_str(args.into_iter().next().unwrap_or(ExprValue::Null));
            match s {
                Some(v) => ExprValue::Str(v.to_uppercase()),
                None => ExprValue::Null,
            }
        }
        "lower" => {
            let s = coerce_str(args.into_iter().next().unwrap_or(ExprValue::Null));
            match s {
                Some(v) => ExprValue::Str(v.to_lowercase()),
                None => ExprValue::Null,
            }
        }
        "len" => {
            let s = coerce_str(args.into_iter().next().unwrap_or(ExprValue::Null));
            match s {
                Some(v) => ExprValue::Num(v.chars().count() as f64),
                None => ExprValue::Null,
            }
        }
        "trim" => {
            let s = coerce_str(args.into_iter().next().unwrap_or(ExprValue::Null));
            match s {
                Some(v) => ExprValue::Str(v.trim().to_string()),
                None => ExprValue::Null,
            }
        }
        "str" => {
            let val = args.into_iter().next().unwrap_or(ExprValue::Null);
            match coerce_str(val) {
                Some(s) => ExprValue::Str(s),
                None => ExprValue::Null,
            }
        }
        "num" => {
            let val = args.into_iter().next().unwrap_or(ExprValue::Null);
            match val {
                ExprValue::Num(n) => ExprValue::Num(n),
                ExprValue::Str(s) => {
                    if let Ok(n) = s.trim().parse::<f64>() {
                        ExprValue::Num(n)
                    } else {
                        ExprValue::Num(0.0) // Return 0.0 effectively bounding unparsed mappings
                    }
                }
                ExprValue::Null => ExprValue::Num(0.0), // Yields default non-breaking fallback numeric format
            }
        }
        "round" => {
            let mut it = args.into_iter();
            let val = it.next().unwrap_or(ExprValue::Null);
            let decimals = it.next().unwrap_or(ExprValue::Num(0.0));
            match (val, decimals) {
                (ExprValue::Num(n), ExprValue::Num(d)) => {
                    let d = d.max(0.0); // Bounded strictly ensuring positive formatting
                    let factor = 10f64.powi(d as i32);
                    Some(ExprValue::Num((n * factor).round() / factor)).unwrap_or(ExprValue::Null)
                }
                _ => ExprValue::Null,
            }
        }
        _ => ExprValue::Null, // unknown function
    }
}

fn coerce_str(val: ExprValue) -> Option<String> {
    match val {
        ExprValue::Str(s) => Some(s),
        ExprValue::Num(n) => {
            if n.fract() == 0.0 && n.abs() < 1e15 {
                Some(format!("{}", n as i64))
            } else {
                Some(format!("{n}"))
            }
        }
        ExprValue::Null => None,
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn empty_rec() -> HashMap<String, String> {
        HashMap::new()
    }

    fn rec(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    #[test]
    fn expr_arithmetic() {
        // 2 + 3 * 4 = 14  (correct precedence: * before +)
        let v = eval_expr("2 + 3 * 4", &empty_rec(), None);
        assert_eq!(v, ExprValue::Num(14.0));
    }

    #[test]
    fn expr_string_concat() {
        let v = eval_expr("\"hola\" + \" \" + \"mundo\"", &empty_rec(), None);
        assert_eq!(v, ExprValue::Str("hola mundo".into()));
    }

    #[test]
    fn expr_function_upper() {
        let v = eval_expr("upper(\"texto\")", &empty_rec(), None);
        assert_eq!(v, ExprValue::Str("TEXTO".into()));
    }

    #[test]
    fn expr_function_len() {
        let v = eval_expr("len(\"abc\")", &empty_rec(), None);
        assert_eq!(v, ExprValue::Num(3.0));
    }

    #[test]
    fn expr_null_on_error() {
        // Division by zero must return Null, not panic
        let v = eval_expr("10 / 0", &empty_rec(), None);
        assert_eq!(v, ExprValue::Null);
    }

    #[test]
    fn expr_column_ref() {
        let r = rec(&[("precio", "10.0")]);
        let v = eval_expr("precio", &r, None);
        assert_eq!(v, ExprValue::Num(10.0));
    }

    #[test]
    fn expr_if_true_false() {
        let v1 = eval_expr("if(1, \"high\", \"normal\")", &empty_rec(), None);
        assert_eq!(v1, ExprValue::Str("high".into()));

        let v2 = eval_expr("if(0, \"high\", \"normal\")", &empty_rec(), None);
        assert_eq!(v2, ExprValue::Str("normal".into()));
    }

    #[test]
    fn expr_if_nested() {
        let r = rec(&[("val", "5")]);
        // Nested logic: 5 > 10 is false. 5 > 2 is true -> "mid"
        let exp = "if(val > 10, \"max\", if(val > 2, \"mid\", \"min\"))";
        let v = eval_expr(exp, &r, None);
        assert_eq!(v, ExprValue::Str("mid".into()));
    }

    #[test]
    fn expr_round_and_num() {
        let r = rec(&[("p", "10.556")]);
        let vr = eval_expr("round(num(p), 1)", &r, None);
        assert_eq!(vr, ExprValue::Num(10.6));

        // Unparseable implicitly coerces down to safe 0.0 yielding stability
        let v_nan = eval_expr("num(\"invalido\")", &empty_rec(), None);
        assert_eq!(v_nan, ExprValue::Num(0.0));
    }

    #[test]
    fn expr_aggregates() {
        let row1 = rec(&[("cat", "A"), ("val", "10")]);
        let row2 = rec(&[("cat", "B"), ("val", "20")]);
        let row3 = rec(&[("cat", "A"), ("val", "30")]);
        
        let all = vec![row1.clone(), row2, row3];
        let context = Some(all.as_slice());

        let v_sum = eval_expr("sum(val)", &row1, context);
        assert_eq!(v_sum, ExprValue::Num(60.0));

        let v_avg = eval_expr("avg(val)", &row1, context);
        assert_eq!(v_avg, ExprValue::Num(20.0));

        // countif(val > 15): row2(20>15), row3(30>15) -> 2.0
        let v_count_num = eval_expr("countif(val > 15)", &row1, context);
        assert_eq!(v_count_num, ExprValue::Num(2.0));

        // countif(cat == "A"): row1, row3 -> 2.0
        let v_count_cat = eval_expr("countif(cat == \"A\")", &row1, context);
        assert_eq!(v_count_cat, ExprValue::Num(2.0));
    }

    #[test]
    fn expr_relational() {
        let r = rec(&[("a", "10"), ("b", "20"), ("c", "10")]);
        
        // >
        assert_eq!(eval_expr("b > a", &r, None), ExprValue::Num(1.0));
        assert_eq!(eval_expr("a > b", &r, None), ExprValue::Num(0.0));

        // <
        assert_eq!(eval_expr("a < b", &r, None), ExprValue::Num(1.0));
        assert_eq!(eval_expr("b < a", &r, None), ExprValue::Num(0.0));

        // >=
        assert_eq!(eval_expr("a >= c", &r, None), ExprValue::Num(1.0));
        assert_eq!(eval_expr("b >= a", &r, None), ExprValue::Num(1.0));
        assert_eq!(eval_expr("a >= b", &r, None), ExprValue::Num(0.0));

        // <=
        assert_eq!(eval_expr("a <= c", &r, None), ExprValue::Num(1.0));
        assert_eq!(eval_expr("a <= b", &r, None), ExprValue::Num(1.0));
        assert_eq!(eval_expr("b <= a", &r, None), ExprValue::Num(0.0));

        // ==
        assert_eq!(eval_expr("a == c", &r, None), ExprValue::Num(1.0));
        assert_eq!(eval_expr("a == b", &r, None), ExprValue::Num(0.0));

        // !=
        assert_eq!(eval_expr("a != b", &r, None), ExprValue::Num(1.0));
        assert_eq!(eval_expr("a != c", &r, None), ExprValue::Num(0.0));

        // strings
        let s = rec(&[("s1", "abc"), ("s2", "xyz"), ("s3", "abc")]);
        assert_eq!(eval_expr("s1 == s3", &s, None), ExprValue::Num(1.0));
        assert_eq!(eval_expr("s1 != s2", &s, None), ExprValue::Num(1.0));
        assert_eq!(eval_expr("s2 > s1", &s, None), ExprValue::Num(1.0));
        assert_eq!(eval_expr("s1 < s2", &s, None), ExprValue::Num(1.0));
    }
}
