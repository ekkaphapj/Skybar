using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Data.OleDb;


namespace TheCottageSkyBar
{
    public partial class Stock : Form
    {
        public Stock()
        {
            InitializeComponent();
        }

        private void label2_Click(object sender, EventArgs e)
        {

        }

        private void Stock_Load(object sender, EventArgs e)
        {
            loadItemType();
           
        }

        private void loadLatestStockTransactionID()
        {
            int _id = 0;
            string strSQL = "SELECT MAX(ID) AS TRANID FROM StockTransaction";
            OleDbConnection connection = new OleDbConnection(Form1.connStringMain);
            OleDbCommand command = new OleDbCommand(strSQL, connection);
            connection.Open();
            OleDbDataReader reader = command.ExecuteReader();
            while (reader.Read())
            {
                try {
                    _id = Convert.ToInt32(reader["TRANID"].ToString());
                }
                catch(Exception)
                {

                }
            }
            reader.Close();
            connection.Close();
            _id++;
            textBox4.Text = _id.ToString();
        }

        private void button2_Click(object sender, EventArgs e)
        {
            this.Close();
        }


        private void loadItemType()
        {
            comboBox1.Items.Clear();
            string strSQL = "SELECT ItemType.Name1 FROM ItemType;";
            OleDbConnection connection = new OleDbConnection(Form1.connStringMain);
            OleDbCommand command = new OleDbCommand(strSQL, connection);
            connection.Open();
            OleDbDataReader reader = command.ExecuteReader();
            while (reader.Read())
                comboBox1.Items.Add(reader["Name1"].ToString());

            reader.Close();
            connection.Close();
        }

        private void LoadStockTransactionID()
        {
            string strSQL = "SELECT MAX(ID) AS STID FROM STOCKTRANSACTION";
            OleDbConnection connection = new OleDbConnection(Form1.connStringMain);
            OleDbCommand command = new OleDbCommand(strSQL, connection);
            connection.Open();
            OleDbDataReader reader = command.ExecuteReader();
            while (reader.Read())
                stockTransactionID = reader["STID"].ToString();

            reader.Close();
            connection.Close();
        }

        private void button1_Click(object sender, EventArgs e)
        {
            if (comboBox1.SelectedIndex!=-1)
            {
                LoadStockData();
                loadLatestStockTransactionID();
            }
            else
            {
                MessageBox.Show("เลือกประเภทสินค้า");
            }
        }

        private void LoadStockData()
        {
            dataGridView1.DataSource = null;
            string strProvider = Form1.connStringMain; ;
            OleDbConnection con = new OleDbConnection(strProvider);
            string strSQL = "SELECT  Items.ID as รหัสสินค้า,Items.Name1 AS รายการ, Stock.Amount as จำนวน,Stock.Date1 as วันที่,Stock.Time1 as เวลา FROM (Items INNER JOIN ItemType ON Items.ItemTypeID = ItemType.ID) INNER JOIN Stock ON Items.ID = Stock.ItemID where ItemType.Name1='"+comboBox1.SelectedItem.ToString()+"' order by ItemType.Name1";
            OleDbCommand cmd = new OleDbCommand(strSQL, con);
            con.Open();
            //MessageBox.Show("ok");
            cmd.CommandType = CommandType.Text;
            OleDbDataAdapter da = new OleDbDataAdapter(cmd);
            DataTable data = new DataTable();
            da.Fill(data);
            dataGridView1.DataSource = data;
            con.Close();
        }

        private void button3_Click(object sender, EventArgs e)
        {
            reset();

        }

        private void reset()
        {
            dataGridView1.DataSource = null;
            comboBox1.SelectedIndex = -1;
            comboBox2.SelectedIndex = -1;
            comboBox3.SelectedIndex = -1;
            comboBox4.SelectedIndex = -1;
            textBox1.Text = "";
            textBox2.Text = "";
            //textBox4.Text = "";
            textBox3.Text = "";
            textBox5.Text = "";
            textBox6.Text = "";
            textBox7.Text = "";
            textBox8.Text = "";
            dateTimePicker1.Value = DateTime.Now;
            this.ActiveControl = comboBox1;
        }

        private void dataGridView1_CellContentDoubleClick(object sender, DataGridViewCellEventArgs e)
        {
            int rowindex = dataGridView1.CurrentCell.RowIndex;
            textBox8.Text = dataGridView1.Rows[rowindex].Cells[0].Value.ToString(); // item id
            textBox1.Text = dataGridView1.Rows[rowindex].Cells[1].Value.ToString(); // item name
            textBox2.Text = dataGridView1.Rows[rowindex].Cells[2].Value.ToString(); // item amount



        }

        private void button4_Click(object sender, EventArgs e)
        {
            if (validator())
            {
                if (comboBox2.SelectedIndex==0) //เพิ่มของ รายจ่าย
                {
                    if (textBox5.Text!="")
                    {
                        if (insertStockTransaction())
                        {
                            if (insertAccount(0))
                            {
                                insertStock();
                                MessageBox.Show("ทำการบันทึกรายการสต็อค และรายรับรายจ่ายเรียบร้อยแล้ว");
                                if (comboBox3.SelectedIndex==1)
                                {
                                    insertCash(0);
                                    MessageBox.Show("ทำการบันทึกรายการเงินสดเรียบร้อยแล้ว");
                                }
                                reset();
                            }
                            else
                                MessageBox.Show("ไม่สามารถบันทึกรายรับรายจ่ายได้");
                        }
                        else
                            MessageBox.Show("ไม่สามารถบันทึกรายการสต็อคได้");
                    }
                }
                else if (comboBox2.SelectedIndex == 1) //รายจ่ายอื่นๆ
                {
                    if (insertAccount(1))
                    {
                        MessageBox.Show("บันทึกรายจ่ายเรียบร้อย");
                        if (comboBox3.SelectedIndex == 1)
                        {
                            insertCash(0);
                            MessageBox.Show("ทำการบันทึกรายการเงินสดเรียบร้อยแล้ว");
                        }
                        reset();
                    }
                }
                else if (comboBox2.SelectedIndex == 2) //รายรับอื่นๆ
                {
                    if (insertAccount(2))
                    {
                        MessageBox.Show("บันทึกรายรับเรียบร้อย");
                        if (comboBox3.SelectedIndex == 1)
                        {
                            insertCash(1);
                            MessageBox.Show("ทำการบันทึกรายการเงินสดเรียบร้อยแล้ว");
                        }
                        reset();
                    }
                }
                else
                {
                    if (insertStockTransaction())
                    {
                        insertStock();
                        MessageBox.Show("ทำการบันทึกรายการสต็อคเรียบร้อยแล้ว");
                        reset();
                    }
                    else
                        MessageBox.Show("ไม่สามารถบันทึกรายการสต็อคได้");
                }
                   
            }

               
        }


        string list = "";
        private bool insertAccount(int type)
        {
            string strSQL = "";
            if (type == 0) // ซื้อของ
            {
                LoadStockTransactionID();
                list = "รายการซื้อของ " + textBox1.Text + " จำนวน " + textBox3.Text + " ชิ้น";
                strSQL = "INSERT INTO ACCOUNT(DATE1,PAYMENTTYPE,AMOUNT,TYPE,BILLID,STOCKTRANSACTIONID,List,Owner) VALUES(#" + getDateTime(dateTimePicker1.Value.ToShortDateString()) + "#,'" + comboBox3.SelectedItem.ToString() + "'," + textBox5.Text + ",'รายจ่าย',055," + stockTransactionID + ",'" + list + "','" + comboBox4.SelectedItem.ToString() + "')";
            }
            else if (type==1) //รายจ่ายอื่นๆ
            {
                list = "รายจ่าย " + textBox7.Text + " เป็นเงินจำนวน " + textBox5.Text + " บาท";
                strSQL = "INSERT INTO ACCOUNT(DATE1,PAYMENTTYPE,AMOUNT,TYPE,List,Owner) VALUES(#" + getDateTime(dateTimePicker1.Value.ToShortDateString()) + "#,'" + comboBox3.SelectedItem.ToString() + "'," + textBox5.Text + ",'รายจ่าย','" + list + "','" + comboBox4.SelectedItem.ToString() + "')";
            }
            else if (type == 2) //รายรับอื่นๆ
            {
                list = "รายรับ " + textBox7.Text + " เป็นเงินจำนวน " + textBox5.Text + " บาท";
                strSQL = "INSERT INTO ACCOUNT(DATE1,PAYMENTTYPE,AMOUNT,TYPE,List,Owner) VALUES(#" + getDateTime(dateTimePicker1.Value.ToShortDateString()) + "#,'" + comboBox3.SelectedItem.ToString() + "'," + textBox5.Text + ",'รายรับ','" + list + "','" + comboBox4.SelectedItem.ToString() + "')";
            }
            int _success = 0;
            string strProvider = Form1.connStringMain;
            OleDbConnection connection = new OleDbConnection(strProvider);
            connection.Open();
            OleDbCommand command = new OleDbCommand(strSQL, connection);
            _success = command.ExecuteNonQuery();
            connection.Close();
            if (_success != 0)
            {

                return true;
            }
            else
                return false;
          
        }


        private void insertCash(int type)
        {
            
            string _acctid = "";
            string strSQL = "SELECT MAX(ID) AS ACCTID FROM ACCOUNT";
            OleDbConnection connection = new OleDbConnection(Form1.connStringMain);
            OleDbCommand command = new OleDbCommand(strSQL, connection);
            connection.Open();
            OleDbDataReader reader = command.ExecuteReader();
            while (reader.Read())
                _acctid = reader["ACCTID"].ToString();
            reader.Close();

            if (type == 0)
            {
                strSQL = "INSERT INTO CASH(DATE1,TYPE1,LIST,TIME1,AMOUNT,ACCOUNTID) VALUES(#" + getDateTime(dateTimePicker1.Value.ToShortDateString()) + "#,'รายจ่าย','" + list + "',#" + getDateTime(DateTime.Now.ToString()) + "#,-" + textBox5.Text + "," + _acctid + ")";
            }
            else
                strSQL = "INSERT INTO CASH(DATE1,TYPE1,LIST,TIME1,AMOUNT,ACCOUNTID) VALUES(#" + getDateTime(dateTimePicker1.Value.ToShortDateString()) + "#,'รายรับ','" + list + "',#" + getDateTime(DateTime.Now.ToString()) + "#," + textBox5.Text + "," + _acctid + ")";

            command = new OleDbCommand(strSQL, connection);
            command.ExecuteNonQuery();
            connection.Close();
        }


        string stockTransactionID = "";
        private bool validator()
        {
            if (comboBox2.SelectedIndex == -1)
            {
                MessageBox.Show("เลือกรายการ เพิ่ม หรือ ปรับปรุง หรือ ทิ้งสินค้า หรือรายรับรายจ่าย");
                return false;
            }

            if (comboBox2.SelectedIndex == 0) //ซื้อสินค้าเพิ่ม
            {
                try
                {
                    Convert.ToInt64(textBox8.Text);
                }
                catch
                {
                    MessageBox.Show("รหัสสินค้าไม่ถูกต้อง");
                    return false;
                }



                try
                {
                    Convert.ToInt16(textBox3.Text);
                }
                catch
                {
                    MessageBox.Show("จำนวนสินค้าไม่ถูกต้อง");
                    return false;
                }

                if (textBox6.Text == "")
                {
                    MessageBox.Show("ใส่สภานที่ด้วย");
                    return false;
                }

            }
            if (comboBox2.SelectedIndex != 3) //ถ้าไม่ใช่รายการสูญหาย
            {
                try
                {
                    Convert.ToDouble(textBox5.Text);
                }
                catch
                {
                    MessageBox.Show("ราคาสินค้าไม่ถูกต้อง");
                    return false;
                }
            }

            if (comboBox2.SelectedIndex !=3) //ถ้าไม่ใช่รายการสูญหาย
            {
                if (comboBox3.SelectedIndex == -1)
                {
                    MessageBox.Show("เลือกวิธีชำระเงิน");
                    return false;
                }
            }


          

            if (comboBox4.SelectedIndex == -1)
            {
                MessageBox.Show("เลือกผู้บันทึก");
                return false;
            }

            return true;
        }
        string _amount = "";
        private bool insertStockTransaction()
        {
            int _success = 0;
            string strProvider = Form1.connStringMain;
            _amount = "";
            string _paymenttype = "none";
            try
            {
                _paymenttype = comboBox4.SelectedItem.ToString();
            }
            catch (Exception)
            { }
            if (comboBox2.SelectedIndex == 3)
                _amount = "-" + textBox3.Text;
            else
                _amount = textBox3.Text;
            string strSQL = "INSERT INTO StockTransaction(TransactionType,Amount,Price,DateRecord,Date2,Place,ItemID,PaymentType,Owner,Comment)  VALUES('"+comboBox2.SelectedItem.ToString()+"',"+_amount+","+textBox5.Text+",#"+getDateTime( DateTime.Now.ToShortDateString())+"#,#"+getDateTime( dateTimePicker1.Value.ToShortDateString())+"#,'"+textBox6.Text+"',"+textBox8.Text+",'"+_paymenttype+"','"+comboBox4.SelectedItem.ToString()+"','"+textBox7.Text+"');";
            OleDbConnection connection = new OleDbConnection(strProvider);
            connection.Open();
            OleDbCommand command = new OleDbCommand(strSQL, connection);
            _success= command.ExecuteNonQuery();


            connection.Close();
            if (_success != 0)
                return true;
            else
                return false;
           
        }


        private string getDateTime(string date)
        {
            string dateNewFormat = Convert.ToDateTime(date).ToString("MM/dd/yyyy", System.Globalization.CultureInfo.InvariantCulture);
            return dateNewFormat;

        }
        private bool insertStock()
        {
            int _success = 0;
            int _totalAmount = Convert.ToInt16(_amount) + Convert.ToInt16(textBox2.Text);
            string strProvider = Form1.connStringMain;
            string strSQL = "update Stock set Amount="+_totalAmount+",date1=#"+getDateTime( DateTime.Now.ToShortDateString())+"#,time1=#"+DateTime.Now.ToString("HH:mm:ss") +"# where itemID='"+textBox8.Text+"';";
            OleDbConnection connection = new OleDbConnection(strProvider);
            connection.Open();
            OleDbCommand command = new OleDbCommand(strSQL, connection);
            _success = command.ExecuteNonQuery();
            connection.Close();
            if (_success != 0)
                return true;
            else
                return false;

        }

        private void comboBox2_SelectedIndexChanged(object sender, EventArgs e)
        {
            try {
                if (comboBox2.SelectedIndex==3) // สูญหาย
                {
                    textBox5.ReadOnly = true;
                    textBox5.Text = "0";
                    comboBox3.Visible = false;
                    textBox3.Visible = true;
                    textBox6.Visible = true;
                }
                else if (comboBox2.SelectedIndex == 0) // ซื้อเพิ่ม
                {
                    textBox5.ReadOnly = false;
                    comboBox3.Visible = true;
                    textBox5.Text = "";
                    textBox3.Visible = true;
                    textBox6.Visible = true;
                }
                else
                {
                    textBox5.ReadOnly = false;
                    comboBox3.Visible = true;
                    textBox5.Text = "";
                    textBox3.Visible = false;
                    textBox6.Visible = false;
                }
            }
            catch (Exception)
            {

            }
        }

        private void textBox4_TextChanged(object sender, EventArgs e)
        {

        }

        CashDepositForm cashForm;
        private void button5_Click(object sender, EventArgs e)
        {
            try
            {
                cashForm.Dispose();
            }
            catch (Exception)
            {

            }
            cashForm = new CashDepositForm();
            cashForm.Show();

        }

        private void comboBox4_SelectedIndexChanged(object sender, EventArgs e)
        {

        }
    }
}
